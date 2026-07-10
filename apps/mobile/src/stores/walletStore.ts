import { create } from "zustand";
import * as SecureStore from "../utils/secureStorage";
import { walletService } from "../services/walletService";
import { syncService } from "../services/syncService";
import { localWalletService, hashPassword, hashMnemonic } from "../services/localWalletService";
import { localAccountService } from "../services/localAccountService";
import { localAddressService } from "../services/localAddressService";
import { notificationSyncService } from "../services/notificationSyncService";
import { localNotificationService } from "../services/localNotificationService";
import { syncWalletsWithServer, syncSubscribedWallets } from "../services/walletSyncService";
import { generateMnemonic, cleanMnemonic, generateIdentifier } from "../utils/mnemonic";
import { deriveAddressFromMnemonic, getDerivationPath } from "../utils/derivation";
import { ensureDeviceKeys, ensureDeviceRegistered } from "../services/api";
import { useAuthStore } from "./authStore";
import { saveLogToLocal } from "../services/logService";
import { getErrorMessage } from "../utils/format";
import { perfProbe } from "../utils/perfProbe";
import type { SimpleWallet, Account, AssetBalance, LocalWallet } from "../types";

const MNEMONIC_KEY_PREFIX = "aquad_mnemonic_";
const BACKED_UP_KEY_PREFIX = "aquad_backed_up_";

/** Build per-wallet SecureStore key for mnemonic */
/** In-flight dedup for fetchBalance: prevents duplicate concurrent requests */
const balanceFetchInFlight: Record<string, boolean> = {};

function mnemonicKey(walletId: string): string {
  return `${MNEMONIC_KEY_PREFIX}${walletId}`;
}

/** Build per-wallet SecureStore key for backup status */
function backedUpKey(walletId: string): string {
  return `${BACKED_UP_KEY_PREFIX}${walletId}`;
}

/** Convert LocalWallet (DB row) to SimpleWallet (UI type) */
function localToSimple(w: LocalWallet): SimpleWallet {
  return {
    id: w.id,
    name: w.name,
    source: w.source,
    type: w.type,
    sortOrder: w.sort_order,
    isPinned: w.is_pinned,
    avatar: w.avatar,
    passwordHint: w.password_hint,
    createdAt: w.created_at,
    isReadOnly: w.source === "SUBSCRIBE",
  };
}

interface WalletState {
  mnemonic: string | null;
  backedUpWallets: Set<string>;
  hasWallets: boolean;
  wallets: SimpleWallet[];
  activeWallet: SimpleWallet | null;
  accounts: Account[];
  activeAccount: Account | null;
  totalBalanceUsd: string;
  assets: AssetBalance[];
  loading: boolean;
  balanceLoading: boolean;
  hasFetched: boolean;
  accountCount: number;

  loadLocalState: () => Promise<void>;
  syncWalletsWithServer: () => Promise<void>;
  syncSubscribedWalletsAsync: () => Promise<void>;
  fetchWallets: () => Promise<void>;
  fetchWalletsAggregate: () => Promise<SimpleWallet[]>;
  fetchAccounts: (walletId: string) => Promise<void>;
  setActiveWallet: (wallet: SimpleWallet) => void;
  setActiveAccount: (account: Account) => void;
  createWallet: (alias: string, password: string, passwordHint?: string, onStage?: (stage: string) => void) => Promise<string>;
  importWallet: (mnemonic: string, alias: string, password: string, passwordHint?: string, onStage?: (stage: string) => void) => Promise<string>;
  resetPassword: (walletId: string, mnemonic: string, password: string, passwordHint?: string) => Promise<void>;
  deleteWallet: (walletId: string) => Promise<void>;
  backupWallet: (walletId: string) => Promise<void>;
  isWalletBackedUp: (walletId: string) => boolean;
  addAccount: (walletId: string, network: string, name?: string, allowMultiAccount?: boolean, onStage?: (stage: string) => void) => Promise<void>;
  addAccounts: (walletId: string, networks: string[], allowMultiAccount?: boolean, onStage?: (stage: string) => void) => Promise<void>;
  deleteAccount: (accountId: string) => Promise<void>;
  fetchBalance: (walletId: string) => Promise<void>;
  verifyPassword: (walletId: string, password: string) => Promise<boolean>;
  subscribeWallet: (walletId: string) => Promise<void>;
  unsubscribeWallet: (walletId: string) => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  mnemonic: null,
  backedUpWallets: new Set<string>(),
  hasWallets: false,
  wallets: [],
  activeWallet: null,
  accounts: [],
  activeAccount: null,
  totalBalanceUsd: "0",
  assets: [],
  loading: false,
  balanceLoading: false,
  hasFetched: false,
  accountCount: 0,

  isWalletBackedUp: (walletId: string): boolean => {
    return get().backedUpWallets.has(walletId);
  },

  /** Load local state: local data first (no network dependency), then network sync */
  loadLocalState: async () => {
    // ── 阶段 1：本地数据加载（不依赖网络，必须成功才能判断路由）──
    try {
      await get().fetchWallets();
    } catch {
      // 本地数据读取失败（IndexedDB/SQLite 异常），这才是真正无法判断是否有钱包的情况
      set({ hasFetched: true, hasWallets: false });
      return;
    }

    // ── 阶段 2：设备初始化 + 网络同步（失败不影响本地数据已加载的事实）──
    // 设备初始化必须先完成（后续 API 请求需要签名），钱包同步和通知同步可并行
    try {
      const keys = await ensureDeviceKeys();
      if (keys) {
        await ensureDeviceRegistered(keys.publicKeyHex);
        await useAuthStore.getState().initDevice();
      }
    } catch {
      // 设备注册失败不影响本地钱包数据展示
    }

    // ── 阶段 3：网络同步（并行执行，失败不影响本地数据）──
    await Promise.allSettled([
      get().syncWalletsWithServer(),
      get().syncSubscribedWalletsAsync(),
      notificationSyncService.syncNotifications(),
    ]);
  },

  /**
   * Re-sync all local wallets and accounts to server.
   * Idempotent: safe to call on every startup.
   * Recovers from server data loss by re-registering wallets and re-syncing addresses.
   */
  syncWalletsWithServer: async () => {
     await syncWalletsWithServer();  },

  /**
   * 异步加载订阅钱包 — 从后端获取当前设备的钱包列表，
   * 发现本地不存在时以 SUBSCRIBE 写入本地并同步地址。
   * 不阻塞启动，异步执行。
   */
  syncSubscribedWalletsAsync: async () => {
    try {
       await syncSubscribedWallets();      await get().fetchWallets();
    } catch {
      // silent — 异步同步失败不影响用户
    }
  },

  /** Fetch wallets from local SQLite */
  fetchWallets: async () => {
    set({ loading: true });
    try {
      const localWallets = await localWalletService.getAllWallets();
      const wallets = localWallets.map(localToSimple);
      // 保持用户已选择的钱包，如果该钱包仍在列表中；否则取第一个
      const currentActive = get().activeWallet;
      const active = currentActive && wallets.some((w) => w.id === currentActive.id)
        ? wallets.find((w) => w.id === currentActive.id)!
        : wallets[0] || null;

      let accounts: Account[] = [];
      if (active) {
        try {
          accounts = await localAccountService.getWalletAccounts(active.id);
        } catch {
          // accounts may not exist yet
        }
      }

      // Load per-wallet backup status (only on first load; subsequent calls reuse memory Set)
      const currentBackedUp = get().backedUpWallets;
      const backedUpSet = get().hasFetched
        ? new Set(currentBackedUp)  // 复用内存中的 Set
        : new Set<string>();
      if (!get().hasFetched) {
        // 首次加载：从 SecureStore 读取备份标记
        for (const w of wallets) {
          const flag = await SecureStore.getItemAsync(backedUpKey(w.id));
          if (flag === "true") {
            backedUpSet.add(w.id);
          }
        }
      }

      set({
        wallets,
        activeWallet: active,
        accounts,
        activeAccount: accounts[0] || null,
        accountCount: accounts.length,
        hasWallets: wallets.length > 0,
        hasFetched: true,
        backedUpWallets: backedUpSet,
      });
    } catch {
      set({ hasFetched: true });
    }
    set({ loading: false });
  },

  /** Fetch wallets aggregate data (with networks, for wallet list page) */
  fetchWalletsAggregate: async () => {
    set({ loading: true });
    try {
      const localWallets = await localWalletService.getAllWallets();

      // 一次性查询所有账户，内存中按 wallet_id 分组（消除 N+1 查询）
      const allAccounts = await localAccountService.getAllAccounts();
      const accountsByWallet = new Map<string, Account[]>();
      for (const acc of allAccounts) {
        const list = accountsByWallet.get(acc.walletId) || [];
        list.push(acc);
        accountsByWallet.set(acc.walletId, list);
      }

      const wallets = localWallets.map((w) => {
        const walletAccounts = accountsByWallet.get(w.id) || [];
        const networks = [...new Set(walletAccounts.map((a) => a.chain))];
        return {
          ...localToSimple(w),
          networks,
        };
      });

      // 保持用户已选择的钱包，如果该钱包仍在列表中；否则取第一个
      const currentActive = get().activeWallet;
      const active = currentActive && wallets.some((w) => w.id === currentActive.id)
        ? wallets.find((w) => w.id === currentActive.id)!
        : wallets[0] || null;

      // 复用内存中的备份标记（不再重复读取 SecureStore）
      const backedUpSet = new Set(get().backedUpWallets);

      set({
        wallets,
        activeWallet: active,
        hasWallets: wallets.length > 0,
        hasFetched: true,
        backedUpWallets: backedUpSet,
      });

      return wallets;
    } catch {
      set({ hasFetched: true });
      return [];
    } finally {
      set({ loading: false });
    }
  },

  /** Fetch accounts for a specific wallet from local SQLite */
  fetchAccounts: async (walletId: string) => {
    try {
      const accounts = await localAccountService.getWalletAccounts(walletId);
      set({
        accounts,
        accountCount: accounts.length,
        activeAccount: accounts[0] || null,
      });
    } catch {
      // silent
    }
  },

  setActiveWallet: (wallet: SimpleWallet) => {
    set({ activeWallet: wallet });
    get().fetchAccounts(wallet.id);
    get().fetchBalance(wallet.id);
  },

  setActiveAccount: (account: Account) => {
    set({ activeAccount: account });
  },

  /** Create wallet — generates mnemonic locally, saves to local SQLite + syncs to server */
  createWallet: async (alias: string, password: string, passwordHint?: string, onStage?: (stage: string) => void): Promise<string> => {
    const trace = await perfProbe.startTrace("创建钱包");
    let mnemonic: string;
    onStage?.("正在生成助记词...");
    try {
      mnemonic = await trace.markAsync("生成助记词", generateMnemonic());
    } catch (err: unknown) {
      saveLogToLocal("crash", `[createWallet] generateMnemonic FAILED: error=${getErrorMessage(err, "未知错误")}`);
      perfProbe.endTrace(trace);
      throw new Error("助记词生成失败，请重试");
    }
    if (!mnemonic || mnemonic.trim().split(/\s+/).length !== 12) {
      saveLogToLocal("crash", `[createWallet] generateMnemonic invalid: wordCount=${mnemonic?.trim().split(/\s+/).length || 0}`);
      perfProbe.endTrace(trace);
      throw new Error("助记词生成失败，请重试");
    }

    // 1. 基于助记词确定性生成 walletId
    const walletId = generateIdentifier(mnemonic);

    onStage?.("正在加密数据...");
    // 2. 网络注册 + PBKDF2 hash 真正并行
    trace.mark("开始加密+注册");
    const registerPromise = syncService.registerWallet("CREATE", walletId, alias);
    const hashPromise = Promise.all([hashPassword(password), hashMnemonic(mnemonic)]);
    const [, [passwordHash, mnemonicHash]] = await trace.markAsync("并行: 注册+加密", Promise.all([registerPromise, hashPromise]));

    onStage?.("正在写入本地...");
    // 3. SQLite 写入 + SecureStore 存助记词并行
    await trace.markAsync("本地写入", Promise.all([
      localWalletService.createWallet({
        id: walletId,
        name: alias,
        source: "CREATE",
        password_hash: passwordHash,
        password_hint: passwordHint || "",
        mnemonic_hash: mnemonicHash,
      }),
      SecureStore.setItemAsync(mnemonicKey(walletId), mnemonic),
    ]));

    // 写库成功后直接更新内存，不再 fetchWallets 查库
    const newWallet: SimpleWallet = {
      id: walletId,
      name: alias,
      source: "CREATE",
      type: "",
      sortOrder: 0,
      isPinned: false,
      avatar: "",
      passwordHint: passwordHint || "",
      createdAt: new Date().toISOString(),
      isReadOnly: false,
    };

    set({ mnemonic, hasWallets: true, wallets: [...get().wallets, newWallet], activeWallet: newWallet, accounts: [], activeAccount: null, accountCount: 0 });
    perfProbe.endTrace(trace);
    return walletId;
  },

  /** Import wallet with mnemonic */
  importWallet: async (mnemonicInput: string, alias: string, password: string, passwordHint?: string, onStage?: (stage: string) => void): Promise<string> => {
    const trace = await perfProbe.startTrace("导入钱包");
    const cleaned = cleanMnemonic(mnemonicInput);

    // 1. 基于助记词确定性生成 walletId
    const walletId = generateIdentifier(cleaned);

    // 2. 网络注册 + PBKDF2 hash 真正并行
    trace.mark("开始加密+注册");
    const registerPromise = syncService.registerWallet("IMPORT", walletId, alias);
    const hashPromise = Promise.all([hashPassword(password), hashMnemonic(cleaned)]);
    const [, [passwordHash, mnemonicHash]] = await trace.markAsync("并行: 注册+加密", Promise.all([registerPromise, hashPromise]));

    // 3. SQLite 写入 + SecureStore 存助记词并行
    await trace.markAsync("本地写入", Promise.all([
      localWalletService.createWallet({
        id: walletId,
        name: alias,
        source: "IMPORT",
        password_hash: passwordHash,
        password_hint: passwordHint || "",
        mnemonic_hash: mnemonicHash,
      }),
      SecureStore.setItemAsync(mnemonicKey(walletId), cleaned),
    ]));

    onStage?.("正在标记备份...");
    // 4. 导入钱包 = 用户已持有助记词，直接标记为已备份
    await trace.markAsync("标记已备份", get().backupWallet(walletId));

    // 写库成功后直接更新内存，不再 fetchWallets 查库
    const newWallet: SimpleWallet = {
      id: walletId,
      name: alias,
      source: "IMPORT",
      type: "",
      sortOrder: 0,
      isPinned: false,
      avatar: "",
      passwordHint: passwordHint || "",
      createdAt: new Date().toISOString(),
      isReadOnly: false,
    };

    set({ mnemonic: mnemonicInput, hasWallets: true, wallets: [...get().wallets, newWallet], activeWallet: newWallet, accounts: [], activeAccount: null, accountCount: 0 });
    perfProbe.endTrace(trace);
    return walletId;
  },

  /** Reset wallet password — verify mnemonic locally then update password */
  resetPassword: async (walletId: string, mnemonic: string, password: string, passwordHint?: string): Promise<void> => {
    const cleaned = cleanMnemonic(mnemonic);

    // 本地验证助记词哈希（传入原始助记词，内部自动判断 v1/v2 版本）
    const valid = await localWalletService.verifyMnemonicHash(walletId, cleaned);
    if (!valid) {
      throw new Error("助记词与当前钱包不匹配");
    }

    // 更新本地密码
    const newPasswordHash = await hashPassword(password);
    await localWalletService.updatePassword(walletId, newPasswordHash, passwordHint);

    // 更新本地助记词存储
    await SecureStore.setItemAsync(mnemonicKey(walletId), cleaned);

    // 写库成功后直接更新内存，不再 fetchWallets 查库
    const currentWallets = get().wallets;
    const updatedWallets = currentWallets.map((w) =>
      w.id === walletId ? { ...w, passwordHint: passwordHint || "" } : w
    );
    const currentActive = get().activeWallet;
    const updatedActive = currentActive?.id === walletId
      ? { ...currentActive, passwordHint: passwordHint || "" }
      : currentActive;
    set({ wallets: updatedWallets, activeWallet: updatedActive });
  },

  /** Delete wallet — delete local + server */
  deleteWallet: async (walletId: string) => {
    const trace = await perfProbe.startTrace("删除钱包");
    try {
      // 从内存 Set 中移除备份标记
      const backedUpSet = new Set(get().backedUpWallets);
      backedUpSet.delete(walletId);
      set({ backedUpWallets: backedUpSet });

      // 本地 SQLite 删除 + SecureStore 删除 + 服务端删除并行
      await trace.markAsync("本地+服务端删除", Promise.all([
        localWalletService.deleteWallet(walletId),
        SecureStore.deleteItemAsync(mnemonicKey(walletId)),
        SecureStore.deleteItemAsync(backedUpKey(walletId)),
        syncService.deleteWallet(walletId),
      ]));

      // 通知清理后台执行，不阻塞
      localNotificationService.deleteWalletNotifications(walletId);

      // 写库成功后直接更新内存，不再 fetchWallets 查库
      const currentWallets = get().wallets;
      const remainingWallets = currentWallets.filter((w) => w.id !== walletId);
      const currentActive = get().activeWallet;
      const newActive = currentActive?.id === walletId
        ? remainingWallets[0] || null
        : currentActive;
      // 删除钱包后清空该钱包的 accounts
      const newAccounts = get().activeWallet?.id === walletId ? [] : get().accounts;
      set({
        wallets: remainingWallets,
        activeWallet: newActive,
        accounts: newAccounts,
        activeAccount: newAccounts[0] || null,
        accountCount: newAccounts.length,
        hasWallets: remainingWallets.length > 0,
      });
    } catch {
      // silent
    }
    perfProbe.endTrace(trace);
  },

  backupWallet: async (walletId: string) => {
    await SecureStore.setItemAsync(backedUpKey(walletId), "true");
    const backedUpSet = new Set(get().backedUpWallets);
    backedUpSet.add(walletId);
    set({ backedUpWallets: backedUpSet });
  },

  /** Add account — derive address locally, save to SQLite + sync to server */
  addAccount: async (walletId: string, network: string, name?: string, allowMultiAccount?: boolean, onStage?: (stage: string) => void) => {
    const trace = await perfProbe.startTrace("添加账户");
    try {
    onStage?.("正在添加账户...");
      // 只读钱包无法添加账户
      const localWallet = await trace.markAsync("读取钱包信息", localWalletService.getWalletById(walletId));
      if (localWallet?.source === "SUBSCRIBE") {
        perfProbe.endTrace(trace);
        throw new Error("只读钱包无法添加账户");
      }

    onStage?.("正在同步到钱包...");
      // 读取助记词用于地址派生
      const mnemonic = await trace.markAsync("读取助记词", SecureStore.getItemAsync(mnemonicKey(walletId)));
      if (!mnemonic) {
        perfProbe.endTrace(trace);
        throw new Error("无法获取助记词，请重新导入钱包");
      }

      // 获取当前链上的最大账户索引
      const maxIndex = await trace.markAsync("查询账户索引", localAccountService.getMaxAccountIndex(walletId, network));
      const accountIndex = maxIndex + 1;

      // 检查是否已存在账户
      if (!allowMultiAccount && maxIndex >= 0) {
        perfProbe.endTrace(trace);
        throw new Error("该钱包下此网络已有账户");
      }

    onStage?.("正在打包数据...");
      // 使用 BIP44 从助记词派生链上地址
      trace.mark("派生地址");
      const address = deriveAddressFromMnemonic(mnemonic, network, accountIndex);
      const derivationPath = getDerivationPath(network, accountIndex);

      const { generateUUID } = await import("../db/database");
      const accountId = generateUUID();
      const accountName = name || `${network} Account ${accountIndex + 1}`;

    onStage?.("正在写入数据...");
      // 同步地址到服务端，获取 serverAddressId
      const serverAddress = await trace.markAsync("POST /wallets/{id}/addresses", syncService.syncAddress(walletId, network, address));

    onStage?.("正在同步远端...");
      // 保存到本地 SQLite + addresses 表 + 刷新账户列表
      await trace.markAsync("本地写入+刷新", Promise.all([
        localAccountService.createAccount({
          id: accountId,
          wallet_id: walletId,
          chain: network,
          derivation_path: derivationPath,
          address: address,
          extended_pubkey: "",
          account_index: accountIndex,
          name: accountName,
          server_address_id: serverAddress.id,
        }),
        localAddressService.upsertAddress({
          chain: network,
          address: address,
          walletId: walletId,
          name: accountName,
          type: "internalWallet",
          status: "verified",
        }),
      ]));
      // 写库成功后直接更新内存，不再 fetchAccounts 查库
      const newAccount: Account = {
        id: accountId,
        walletId,
        chain: network,
        derivationPath,
        address,
        extendedPubkey: "",
        accountIndex,
        name: accountName,
        serverAddressId: serverAddress.id,
        createdAt: new Date().toISOString(),
      };
      // 如果当前活跃钱包就是目标钱包，追加到 accounts 内存
      const currentAccounts = get().accounts;
      const isActiveWallet = get().activeWallet?.id === walletId;
      if (isActiveWallet) {
        set({ accounts: [...currentAccounts, newAccount], accountCount: currentAccounts.length + 1 });
      }
    } catch (err: unknown) {
      perfProbe.endTrace(trace);
      throw err;
    }
    perfProbe.endTrace(trace);
  },

  /** Add accounts (batch) — derive addresses locally, batch sync to server, batch write to SQLite */
  addAccounts: async (walletId: string, networks: string[], allowMultiAccount?: boolean, onStage?: (stage: string) => void) => {
    const trace = await perfProbe.startTrace("批量添加账户");
    try {
      onStage?.("正在添加账户...");
      // 只读钱包无法添加账户
      const localWallet = await trace.markAsync("读取钱包信息", localWalletService.getWalletById(walletId));
      if (localWallet?.source === "SUBSCRIBE") {
        perfProbe.endTrace(trace);
        throw new Error("只读钱包无法添加账户");
      }

      onStage?.("正在同步到钱包...");
      // 读取助记词（一次读取，所有链共用）
      const mnemonic = await trace.markAsync("读取助记词", SecureStore.getItemAsync(mnemonicKey(walletId)));
      if (!mnemonic) {
        perfProbe.endTrace(trace);
        throw new Error("无法获取助记词，请重新导入钱包");
      }

      onStage?.("正在打包数据...");
      // 为每条链派生地址（本地计算，一次 mnemonicToSeedSync）
      const { generateUUID } = await import("../db/database");
      const derivedAccounts: { chain: string; address: string; derivationPath: string; accountId: string; accountName: string; accountIndex: number }[] = [];
      for (const network of networks) {
        const maxIndex = await localAccountService.getMaxAccountIndex(walletId, network);
        const accountIndex = maxIndex + 1;
        if (!allowMultiAccount && maxIndex >= 0) continue; // 跳过全部已有的链
        const address = deriveAddressFromMnemonic(mnemonic, network, accountIndex);
        const derivationPath = getDerivationPath(network, accountIndex);
        const accountId = generateUUID();
        const accountName = `${network} Account`;
        derivedAccounts.push({ chain: network, address, derivationPath, accountId, accountName, accountIndex });
      }

      if (derivedAccounts.length === 0) {
        perfProbe.endTrace(trace);
        return; // 所有链都已存在，无需添加
      }

      onStage?.("正在同步远端...");
      // 一次 HTTP 请求完成所有链的服务端同步（替代逐链 POST /wallets/{id}/addresses）
      const walletAlias = localWallet!.name;
      const walletSource = localWallet!.source === "IMPORT" ? "IMPORT" : "CREATE";
      const syncInput = {
        walletId,
        source: walletSource,
        alias: walletAlias,
        addresses: derivedAccounts.map((d) => ({ chain: d.chain, address: d.address })),
      };
      const syncResults = await trace.markAsync("POST /wallets/sync", walletService.batchSyncWallets([syncInput]));

      onStage?.("正在写入数据...");
      // 批量写入本地 SQLite + 更新内存
      const writePromises = derivedAccounts.map((d) => {
        // 从 syncResults 中找到对应链的 serverAddressId
        const syncAddr = syncResults[0]?.addresses.find((a) => a.chain === d.chain && a.address === d.address);
        const serverAddressId = syncAddr?.serverAddressId || "";
        return Promise.all([
          localAccountService.createAccount({
            id: d.accountId,
            wallet_id: walletId,
            chain: d.chain,
            derivation_path: d.derivationPath,
            address: d.address,
            extended_pubkey: "",
            account_index: d.accountIndex,
            name: d.accountName,
            server_address_id: serverAddressId,
          }),
          localAddressService.upsertAddress({
            chain: d.chain,
            address: d.address,
            walletId,
            name: d.accountName,
            type: "internalWallet",
            status: "verified",
          }),
        ]);
      });
      await Promise.all(writePromises);

      // 更新内存：批量追加 accounts
      const newAccounts: Account[] = derivedAccounts.map((d) => {
        const syncAddr = syncResults[0]?.addresses.find((a) => a.chain === d.chain && a.address === d.address);
        return {
          id: d.accountId,
          walletId,
          chain: d.chain,
          derivationPath: d.derivationPath,
          address: d.address,
          extendedPubkey: "",
          accountIndex: d.accountIndex,
          name: d.accountName,
          serverAddressId: syncAddr?.serverAddressId || "",
          createdAt: new Date().toISOString(),
        };
      });
      const currentAccounts = get().accounts;
      const isActiveWallet = get().activeWallet?.id === walletId;
      if (isActiveWallet) {
        set({ accounts: [...currentAccounts, ...newAccounts], accountCount: currentAccounts.length + newAccounts.length });
      }
    } catch (err: unknown) {
      perfProbe.endTrace(trace);
      throw err;
    }
    perfProbe.endTrace(trace);
  },

  /** Delete account — delete local + server */
  deleteAccount: async (accountId: string) => {
    try {

      const account = await localAccountService.getAccountById(accountId);
      if (!account) return;

      // 删除服务端地址记录
      if (account.serverAddressId) {
        const walletId = get().activeWallet?.id;
        if (walletId) {
          await syncService.deleteAddress(walletId, account.serverAddressId);
        }
      }

      // 删除本地账户
      await localAccountService.deleteAccount(accountId);

      // 删除 addresses 表中对应的 internalWallet 记录（如果是联系人则保留）
      const addrEntry = await localAddressService.getAddress(account.chain, account.address);
      if (addrEntry && addrEntry.type === "internalWallet") {
        await localAddressService.deleteAddress(account.chain, account.address);
      }

      // 写库成功后直接更新内存，不再 fetchAccounts 查库
      const currentAccounts = get().accounts;
      const remainingAccounts = currentAccounts.filter((a) => a.id !== accountId);
      set({
        accounts: remainingAccounts,
        accountCount: remainingAccounts.length,
        activeAccount: remainingAccounts[0] || null,
      });
    } catch (err: unknown) {
      throw err;
    }
  },

  /** Fetch balance for wallet (from server API, with in-flight dedup) */
  fetchBalance: async (walletId: string) => {
    // In-flight dedup: 同一 walletId 的并发请求只发一次
    if (balanceFetchInFlight[walletId]) return;
    balanceFetchInFlight[walletId] = true;
    set({ balanceLoading: true });
    const trace = await perfProbe.startTrace("查询余额");
    try {
      const detail = await trace.markAsync("GET /wallets/{id}/balance", walletService.getWalletBalanceDetail(walletId));
      set({
        totalBalanceUsd: detail.totalBalanceUsd || "0",
        assets: detail.assets || [],
        balanceLoading: false,
      });
    } catch {
      set({ balanceLoading: false });
    } finally {
      delete balanceFetchInFlight[walletId];
      perfProbe.endTrace(trace);
    }
  },

  /** Verify wallet password locally */
  verifyPassword: async (walletId: string, password: string): Promise<boolean> => {
    return localWalletService.verifyPassword(walletId, password);
  },

  /** Subscribe wallet (readonly) — subscribe an existing wallet without mnemonic */
  subscribeWallet: async (walletId: string) => {
    try {
      // 1. 调用后端订阅 API
      const result = await syncService.subscribeWalletReadonly(walletId);
      const serverWallet = result.wallet;
      const serverAddresses = result.addresses || [];

      // 2. 写入本地 wallets 表（source=SUBSCRIBE, 无密码/助记词）
      const existing = await localWalletService.getWalletById(walletId);
      if (!existing) {
        await localWalletService.createWallet({
          id: walletId,
          name: serverWallet.alias || "",
          source: "SUBSCRIBE",
          password_hash: "",
          password_hint: "",
          mnemonic_hash: "",
        });
      }

      // 3. 写入本地 accounts 表（每个地址一条，无派生路径）
      for (const addr of serverAddresses) {
        const existingAccount = await localAccountService.getAccountByAddress(addr.address);
        if (!existingAccount) {
          const { generateUUID } = await import("../db/database");
          const accountId = generateUUID();
          await localAccountService.createAccount({
            id: accountId,
            wallet_id: walletId,
            chain: addr.chain,
            derivation_path: "",
            address: addr.address,
            extended_pubkey: "",
            account_index: -1,
            name: `${addr.chain} Account`,
            server_address_id: addr.id,
          });

          // 同步写入 addresses 表
          await localAddressService.upsertAddress({
            chain: addr.chain,
            address: addr.address,
            walletId: walletId,
            name: `${addr.chain} Account`,
            type: "internalWallet",
            status: "verified",
          });
        }
      }

      // 4. 写库成功后直接更新内存，不再 fetchWallets 查库
      const newWallet: SimpleWallet = {
        id: walletId,
        name: serverWallet.alias || "",
        source: "SUBSCRIBE",
        type: "",
        sortOrder: 0,
        isPinned: false,
        avatar: "",
        passwordHint: "",
        createdAt: new Date().toISOString(),
        isReadOnly: true,
      };
      set({ wallets: [...get().wallets, newWallet], activeWallet: newWallet, hasWallets: true });
    } catch (err: unknown) {
      throw err;
    }
  },

  /** Unsubscribe wallet (readonly) — cancel subscription and clean local data */
  unsubscribeWallet: async (walletId: string) => {
    const trace = await perfProbe.startTrace("取消订阅钱包");
    try {
      // 1. 调用后端取消订阅 API
      await trace.markAsync("DELETE /subscribe", syncService.unsubscribeWalletReadonly(walletId));

      // 2. 删除本地数据（钱包+账户+地址+通知）
      await trace.markAsync("本地删除", Promise.all([
        localWalletService.deleteWallet(walletId),
        localNotificationService.deleteWalletNotifications(walletId),
      ]));

      // 写库成功后直接更新内存，不再 fetchWallets 查库
      const currentWallets = get().wallets;
      const remainingWallets = currentWallets.filter((w) => w.id !== walletId);
      const currentActive = get().activeWallet;
      const newActive = currentActive?.id === walletId
        ? remainingWallets[0] || null
        : currentActive;
      const newAccounts = currentActive?.id === walletId ? [] : get().accounts;
      set({
        wallets: remainingWallets,
        activeWallet: newActive,
        accounts: newAccounts,
        activeAccount: newAccounts[0] || null,
        accountCount: newAccounts.length,
        hasWallets: remainingWallets.length > 0,
      });
    } catch (err: unknown) {
      perfProbe.endTrace(trace);
      throw err;
    }
    perfProbe.endTrace(trace);
  },
  }));
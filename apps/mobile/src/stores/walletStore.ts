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
import { uploadLog, saveLogToLocal } from "../services/logService";
import { getErrorMessage } from "../utils/format";
import type { SimpleWallet, Account, AssetBalance, LocalWallet } from "../types";

const MNEMONIC_KEY_PREFIX = "aquad_mnemonic_";
const BACKED_UP_KEY_PREFIX = "aquad_backed_up_";
const ACTIVE_WALLET_KEY = "aquad_active_wallet";

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
  createWallet: (alias: string, password: string, passwordHint?: string) => Promise<string>;
  importWallet: (mnemonic: string, alias: string, password: string, passwordHint?: string) => Promise<string>;
  resetPassword: (walletId: string, mnemonic: string, password: string, passwordHint?: string) => Promise<void>;
  deleteWallet: (walletId: string) => Promise<void>;
  backupWallet: (walletId: string) => Promise<void>;
  isWalletBackedUp: (walletId: string) => boolean;
  addAccount: (walletId: string, network: string, name?: string, allowMultiAccount?: boolean) => Promise<void>;
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
    try {
      const keys = await ensureDeviceKeys();
      if (keys) {
        await ensureDeviceRegistered(keys.publicKeyHex);
        await useAuthStore.getState().initDevice();
      }
    } catch {
      // 设备注册失败不影响本地钱包数据展示
    }

    try {
      await get().syncWalletsWithServer();
    } catch {
      // 服务端同步失败不影响本地数据
    }

    try {
      await get().syncSubscribedWalletsAsync();
    } catch {
      // 订阅钱包同步失败不影响本地数据
    }

    try {
      await notificationSyncService.syncNotifications();
    } catch {
      // 通知同步失败不阻塞启动
    }
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

      // 复用内存中的备份标记（不再重复读取 SecureStore）
      const backedUpSet = new Set(get().backedUpWallets);

      set({
        wallets,
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
  createWallet: async (alias: string, password: string, passwordHint?: string): Promise<string> => {
    let mnemonic: string;
    try {
      mnemonic = await generateMnemonic();
    } catch (err: unknown) {
      saveLogToLocal("mnemonic", `[createWallet] generateMnemonic threw: ${getErrorMessage(err, "未知错误")}`);
      throw new Error("助记词生成失败，请重试");
    }
    if (!mnemonic || mnemonic.trim().split(/\s+/).length !== 12) {
      saveLogToLocal("mnemonic", `[createWallet] generateMnemonic invalid`);
      throw new Error("助记词生成失败，请重试");
    }

    // 1. 基于助记词确定性生成 walletId
    const walletId = generateIdentifier(mnemonic);

    // 2. 在服务端注册钱包（传 source + walletId + alias）
    await syncService.registerWallet("CREATE", walletId, alias);

    // 3. 生成密码 hash 和助记词 hash
    const passwordHash = hashPassword(password);
    const mnemonicHash = hashMnemonic(mnemonic);

    // 4. 在本地 SQLite 创建钱包记录
    await localWalletService.createWallet({
      id: walletId,
      name: alias,
      source: "CREATE",
      password_hash: passwordHash,
      password_hint: passwordHint || "",
      mnemonic_hash: mnemonicHash,
    });

    // 5. 安全存储助记词
    await SecureStore.setItemAsync(mnemonicKey(walletId), mnemonic);

    set({ mnemonic, hasWallets: true });
    await get().fetchWallets();
    return walletId;
  },

  /** Import wallet with mnemonic */
  importWallet: async (mnemonicInput: string, alias: string, password: string, passwordHint?: string): Promise<string> => {
    const cleaned = cleanMnemonic(mnemonicInput);

    // 1. 基于助记词确定性生成 walletId
    const walletId = generateIdentifier(cleaned);

    // 2. 在服务端注册钱包（传 source + walletId + alias）
    await syncService.registerWallet("IMPORT", walletId, alias);

    // 3. 生成密码 hash 和助记词 hash
    const passwordHash = hashPassword(password);
    const mnemonicHash = hashMnemonic(cleaned);

    // 4. 在本地 SQLite 创建钱包记录
    await localWalletService.createWallet({
      id: walletId,
      name: alias,
      source: "IMPORT",
      password_hash: passwordHash,
      password_hint: passwordHint || "",
      mnemonic_hash: mnemonicHash,
    });

    // 5. 安全存储助记词
    await SecureStore.setItemAsync(mnemonicKey(walletId), cleaned);

    // 6. 导入钱包 = 用户已持有助记词，直接标记为已备份
    await get().backupWallet(walletId);

    set({ mnemonic: mnemonicInput, hasWallets: true });
    await get().fetchWallets();
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
    const newPasswordHash = hashPassword(password);
    await localWalletService.updatePassword(walletId, newPasswordHash, passwordHint);

    // 更新本地助记词存储
    await SecureStore.setItemAsync(mnemonicKey(walletId), cleaned);

    await get().fetchWallets();
  },

  /** Delete wallet — delete local + server */
  deleteWallet: async (walletId: string) => {
    try {
      // 删除本地 SQLite 数据
      await localWalletService.deleteWallet(walletId);

      // 删除本地助记词和备份标记
      await SecureStore.deleteItemAsync(mnemonicKey(walletId));
      await SecureStore.deleteItemAsync(backedUpKey(walletId));

      // 从内存 Set 中移除备份标记
      const backedUpSet = new Set(get().backedUpWallets);
      backedUpSet.delete(walletId);
      set({ backedUpWallets: backedUpSet });

      // 删除服务端钱包（取消订阅）
      await syncService.deleteWallet(walletId);

      // 删除钱包关联的本地通知
      await localNotificationService.deleteWalletNotifications(walletId);

      await get().fetchWallets();
    } catch {
      // silent
    }
  },

  backupWallet: async (walletId: string) => {
    await SecureStore.setItemAsync(backedUpKey(walletId), "true");
    const backedUpSet = new Set(get().backedUpWallets);
    backedUpSet.add(walletId);
    set({ backedUpWallets: backedUpSet });
  },

  /** Add account — derive address locally, save to SQLite + sync to server */
  addAccount: async (walletId: string, network: string, name?: string, allowMultiAccount?: boolean) => {
    try {
      // 只读钱包无法添加账户
      const localWallet = await localWalletService.getWalletById(walletId);
      if (localWallet?.source === "SUBSCRIBE") {
        throw new Error("只读钱包无法添加账户");
      }

      // 读取助记词用于地址派生
      const mnemonic = await SecureStore.getItemAsync(mnemonicKey(walletId));
      if (!mnemonic) {
        throw new Error("无法获取助记词，请重新导入钱包");
      }

      // 获取当前链上的最大账户索引
      const maxIndex = await localAccountService.getMaxAccountIndex(walletId, network);
      const accountIndex = maxIndex + 1;

      // 检查是否已存在账户
      if (!allowMultiAccount && maxIndex >= 0) {
        throw new Error("该钱包下此网络已有账户");
      }

      // 使用 BIP44 从助记词派生链上地址
      const address = deriveAddressFromMnemonic(mnemonic, network, accountIndex);
      const derivationPath = getDerivationPath(network, accountIndex);

      const { generateUUID } = await import("../db/database");
      const accountId = generateUUID();
      const accountName = name || `${network} Account ${accountIndex + 1}`;

      // 同步地址到服务端，获取 serverAddressId
      const serverAddress = await syncService.syncAddress(walletId, network, address);

      // 保存到本地 SQLite
      await localAccountService.createAccount({
        id: accountId,
        wallet_id: walletId,
        chain: network,
        derivation_path: derivationPath,
        address: address,
        extended_pubkey: "",
        account_index: accountIndex,
        name: accountName,
        server_address_id: serverAddress.id,
      });

      // 同步写入 addresses 表（type=internalWallet, status=verified）
      // 用于交易列表显示钱包名称、转账确认页识别本钱包地址
      await localAddressService.upsertAddress({
        chain: network,
        address: address,
        walletId: walletId,
        name: accountName,
        type: "internalWallet",
        status: "verified",
      });

      await get().fetchAccounts(walletId);
    } catch (err: unknown) {
      throw err;
    }
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

      const walletId = get().activeWallet?.id;
      if (walletId) {
        await get().fetchAccounts(walletId);
      }
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
    try {
      const detail = await walletService.getWalletBalanceDetail(walletId);
      set({
        totalBalanceUsd: detail.totalBalanceUsd || "0",
        assets: detail.assets || [],
        balanceLoading: false,
      });
    } catch {
      set({ balanceLoading: false });
    } finally {
      delete balanceFetchInFlight[walletId];
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

      // 4. 刷新钱包列表
      await get().fetchWallets();
    } catch (err: unknown) {
      throw err;
    }
  },

  /** Unsubscribe wallet (readonly) — cancel subscription and clean local data */
  unsubscribeWallet: async (walletId: string) => {
    try {
      // 1. 调用后端取消订阅 API
      await syncService.unsubscribeWalletReadonly(walletId);

      // 2. 删除本地数据（钱包+账户+地址+通知）
      await localWalletService.deleteWallet(walletId);
      await localNotificationService.deleteWalletNotifications(walletId);

      // 3. 刷新钱包列表
      await get().fetchWallets();
    } catch (err: unknown) {
      throw err;
    }
  },
  }));
import { create } from "zustand";
import * as SecureStore from "../utils/secureStorage";
import { walletService } from "../services/walletService";
import { accountService } from "../services/accountService";
import { generateMnemonic, cleanMnemonic } from "../utils/mnemonic";
import { ensureDeviceKeys, ensureDeviceRegistered } from "../services/api";
import { useAuthStore } from "./authStore";
import { uploadLog, saveLogToLocal } from "../services/logService";
import type { Wallet, SimpleWallet, Account, TokenBalance } from "../types";

const MNEMONIC_KEY_PREFIX = "aquad_mnemonic_";
const BACKED_UP_KEY_PREFIX = "aquad_backed_up_";
const ACTIVE_WALLET_KEY = "aquad_active_wallet";

/** Build per-wallet SecureStore key for mnemonic */
function mnemonicKey(walletId: string): string {
  return `${MNEMONIC_KEY_PREFIX}${walletId}`;
}

/** Build per-wallet SecureStore key for backup status */
function backedUpKey(walletId: string): string {
  return `${BACKED_UP_KEY_PREFIX}${walletId}`;
}

interface WalletState {
  mnemonic: string | null;
  /** Set of wallet IDs that have been backed up */
  backedUpWallets: Set<string>;
  hasWallets: boolean;
  wallets: SimpleWallet[];
  activeWallet: SimpleWallet | null;
  accounts: Account[];
  activeAccount: Account | null;
  totalBalanceUsd: string;
  tokens: TokenBalance[];
  loading: boolean;
  hasFetched: boolean;
  accountCount: number;

  loadLocalState: () => Promise<void>;
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
  /** Check if a specific wallet has been backed up */
  isWalletBackedUp: (walletId: string) => boolean;
  addAccount: (walletId: string, network: string, name?: string, allowMultiAccount?: boolean) => Promise<void>;
  deleteAccount: (accountId: string) => Promise<void>;
  fetchBalance: (walletId: string) => Promise<void>;
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
  tokens: [],
  loading: false,
  hasFetched: false,
  accountCount: 0,

  /** Check if a specific wallet has been backed up */
  isWalletBackedUp: (walletId: string): boolean => {
    return get().backedUpWallets.has(walletId);
  },

  /** Load local state: initialize device identity then fetch wallets from server */
  loadLocalState: async () => {
    try {
      // 1. Initialize device identity (generate keys + register)
      const keys = await ensureDeviceKeys();
      if (keys) {
        await ensureDeviceRegistered(keys.publicKeyHex);
        // 显式初始化 authStore，设置 isReady 和 deviceId
        await useAuthStore.getState().initDevice();
      }

      // 2. Load per-wallet backup status from SecureStore
      const backedUpSet = new Set<string>();
      const wallets = await walletService.getWallets();
      for (const w of wallets.wallets) {
        const flag = await SecureStore.getItemAsync(backedUpKey(w.id));
        if (flag === "true") {
          backedUpSet.add(w.id);
        }
      }
      set({ backedUpWallets: backedUpSet });

      // 3. Fetch wallet state from server (sets hasFetched + hasWallets)
      await get().fetchWallets();
    } catch {
      set({ hasFetched: true, hasWallets: false });
    }
  },

  /** Fetch wallets from server */
  fetchWallets: async () => {
    set({ loading: true });
    try {
      const data = await walletService.getWallets();
      const wallets = data.wallets;
      const active = wallets[0] || null;

      let accounts: Account[] = [];
      if (active) {
        try {
          const accData = await accountService.getWalletAccounts(active.id);
          accounts = accData.accounts;
        } catch {
          // accounts may not exist yet
        }
      }

      // Load per-wallet backup status
      const backedUpSet = new Set<string>();
      for (const w of wallets) {
        const flag = await SecureStore.getItemAsync(backedUpKey(w.id));
        if (flag === "true") {
          backedUpSet.add(w.id);
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

      // If server returns empty wallet list, backedUpWallets is already empty
      // hasWallets is already false from the set() above
    } catch (err: any) {
      // If device not registered (401) or server unreachable, reset local state
      // so the app redirects to Start (wallet creation guide) page
      const status = err?.response?.status;
      const errorMsg = err?.response?.data?.error;
      if (status === 401 || errorMsg === "Device not registered") {
        // Device was cleared on server side — reset local wallet state
        // backedUpWallets Set is reset below, per-wallet keys remain in SecureStore
        // but are harmless since they won't match any wallet ID
        set({
          hasWallets: false,
          wallets: [],
          activeWallet: null,
          accounts: [],
          activeAccount: null,
          backedUpWallets: new Set<string>(),
          hasFetched: true,
        });
      } else {
        // Other errors — keep local state, just mark fetch done
        set({ hasFetched: true });
      }
    }
    set({ loading: false });
  },

  /** Fetch wallets aggregate data (with networks, for wallet list page) */
  fetchWalletsAggregate: async () => {
    set({ loading: true });
    try {
      const data = await walletService.getWalletsAggregate();
      const wallets = data.wallets;

      // Load per-wallet backup status
      const backedUpSet = new Set<string>();
      for (const w of wallets) {
        const flag = await SecureStore.getItemAsync(backedUpKey(w.id));
        if (flag === "true") {
          backedUpSet.add(w.id);
        }
      }

      set({
        wallets,
        hasWallets: wallets.length > 0,
        hasFetched: true,
        backedUpWallets: backedUpSet,
      });

      return wallets;
    } catch (err: any) {
      const status = err?.response?.status;
      const errorMsg = err?.response?.data?.error;
      if (status === 401 || errorMsg === "Device not registered") {
        set({
          hasWallets: false,
          wallets: [],
          activeWallet: null,
          backedUpWallets: new Set<string>(),
          hasFetched: true,
        });
      } else {
        set({ hasFetched: true });
      }
      return [];
    } finally {
      set({ loading: false });
    }
  },

  /** Fetch accounts for a specific wallet */
  fetchAccounts: async (walletId: string) => {
    try {
      const data = await accountService.getWalletAccounts(walletId);
      set({
        accounts: data.accounts,
        accountCount: data.accounts.length,
        activeAccount: data.accounts[0] || null,
      });
    } catch {
      // silent
    }
  },

  /** Set active wallet */
  setActiveWallet: (wallet: SimpleWallet) => {
    set({ activeWallet: wallet });
    get().fetchAccounts(wallet.id);
  },

  /** Set active account */
  setActiveAccount: (account: Account) => {
    set({ activeAccount: account });
  },

  /** Create wallet — generates mnemonic locally, creates on server */
  createWallet: async (alias: string, password: string, passwordHint?: string): Promise<string> => {
    let mnemonic: string;
    try {
      mnemonic = await generateMnemonic();
    } catch (err: any) {
      saveLogToLocal("mnemonic", `[createWallet] generateMnemonic threw: ${err?.message || String(err)}, stack=${err?.stack?.slice(0, 200) || "none"}`);
      throw new Error("助记词生成失败，请重试");
    }
    if (!mnemonic || mnemonic.trim().split(/\s+/).length !== 12) {
      saveLogToLocal("mnemonic", `[createWallet] generateMnemonic invalid: words=${mnemonic?.trim().split(/\s+/).length || 0}, prefix=${mnemonic?.slice(0, 20) || "null"}`);
      throw new Error("助记词生成失败，请重试");
    }
    saveLogToLocal("mnemonic", `[createWallet] generateMnemonic OK: words=12, prefix=${mnemonic.slice(0, 20)}`);

    // Create wallet on server with mnemonic for deterministic derivation
    const wallet = await walletService.saveWallet("CREATE", alias, password, passwordHint, mnemonic);

    // Store mnemonic per walletId
    await SecureStore.setItemAsync(mnemonicKey(wallet.id), mnemonic);

    set({
      mnemonic,
      hasWallets: true,
    });

    await get().fetchWallets();
    return wallet.id;
  },

  /** Import wallet with mnemonic */
  importWallet: async (mnemonicInput: string, alias: string, password: string, passwordHint?: string): Promise<string> => {
    // Clean mnemonic before processing
    const cleaned = cleanMnemonic(mnemonicInput);
    const wallet = await walletService.saveWallet("IMPORT", alias, password, passwordHint, cleaned);

    // Store cleaned mnemonic per walletId
    await SecureStore.setItemAsync(mnemonicKey(wallet.id), cleaned);

    set({
      mnemonic: mnemonicInput,
      hasWallets: true,
    });

    await get().fetchWallets();
    return wallet.id;
  },

  /** Reset wallet password — verify mnemonic identity then update password */
  resetPassword: async (walletId: string, mnemonic: string, password: string, passwordHint?: string): Promise<void> => {
    const cleaned = cleanMnemonic(mnemonic);
    await walletService.resetPassword(walletId, cleaned, password, passwordHint);

    // Update local mnemonic storage (keep it consistent)
    await SecureStore.setItemAsync(mnemonicKey(walletId), cleaned);

    await get().fetchWallets();
  },

  /** Delete wallet */
  deleteWallet: async (walletId: string) => {
    try {
      // Delete local mnemonic and backup flag for this wallet
      await SecureStore.deleteItemAsync(mnemonicKey(walletId));
      await SecureStore.deleteItemAsync(backedUpKey(walletId));
      await walletService.deleteWallet(walletId);
      await get().fetchWallets();
    } catch {
      // silent
    }
  },

  /** Mark wallet as backed up (per-wallet, stored in SecureStore) */
  backupWallet: async (walletId: string) => {
    await SecureStore.setItemAsync(backedUpKey(walletId), "true");
    const backedUpSet = new Set(get().backedUpWallets);
    backedUpSet.add(walletId);
    set({ backedUpWallets: backedUpSet });
  },

  /** Add account to wallet — creates accounts for all tokens on the selected network */
  addAccount: async (walletId: string, network: string, name?: string, allowMultiAccount?: boolean) => {
    try {
      // Read mnemonic from SecureStore for deterministic derivation
      let mnemonic: string | undefined;
      try {
        const stored = await SecureStore.getItemAsync(mnemonicKey(walletId));
        if (stored) mnemonic = stored;
      } catch {
        // mnemonic may not be available for CREATE wallets
      }
      await accountService.createAccount(walletId, network, name, mnemonic, allowMultiAccount);
      await get().fetchAccounts(walletId);
    } catch (err: any) {
      throw err;
    }
  },

  /** Delete account */
  deleteAccount: async (accountId: string) => {
    try {
      await accountService.deleteAccount(accountId);
      const walletId = get().activeWallet?.id;
      if (walletId) {
        await get().fetchAccounts(walletId);
      }
    } catch (err: any) {
      throw err;
    }
  },

  /** Fetch balance for wallet (single API call: total balance + token list) */
  fetchBalance: async (walletId: string) => {
    try {
      const detail = await walletService.getWalletBalanceDetail(walletId);
      set({
        totalBalanceUsd: detail.totalBalanceUsd || "0",
        tokens: detail.tokens,
      });
    } catch {
      // silent
    }
  },

}));
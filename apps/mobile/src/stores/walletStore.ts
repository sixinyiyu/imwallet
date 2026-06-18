import { create } from "zustand";
import * as SecureStore from "../utils/secureStorage";
import { walletService } from "../services/walletService";
import { accountService } from "../services/accountService";
import { generateMnemonic, cleanMnemonic } from "../utils/mnemonic";
import type { Wallet, Account, TokenBalance } from "../types";

const MNEMONIC_KEY_PREFIX = "aquad_mnemonic_";
const IS_BACKED_UP_KEY = "aquad_is_backed_up";
const ACTIVE_WALLET_KEY = "aquad_active_wallet";
const HAS_WALLETS_KEY = "aquad_has_wallets";

/** Build per-wallet SecureStore key for mnemonic */
function mnemonicKey(walletId: string): string {
  return `${MNEMONIC_KEY_PREFIX}${walletId}`;
}

interface WalletState {
  mnemonic: string | null;
  isBackedUp: boolean;
  hasWallets: boolean;
  wallets: Wallet[];
  activeWallet: Wallet | null;
  accounts: Account[];
  activeAccount: Account | null;
  totalBalanceUsd: string;
  tokens: TokenBalance[];
  loading: boolean;
  hasFetched: boolean;
  accountCount: number;

  loadLocalState: () => Promise<void>;
  fetchWallets: () => Promise<void>;
  fetchAccounts: (walletId: string) => Promise<void>;
  setActiveWallet: (wallet: Wallet) => void;
  setActiveAccount: (account: Account) => void;
  createWallet: (alias: string, password: string, passwordHint?: string) => Promise<string>;
  importWallet: (mnemonic: string, alias: string, password: string, passwordHint?: string) => Promise<string>;
  resetPassword: (walletId: string, mnemonic: string, password: string, passwordHint?: string) => Promise<void>;
  deleteWallet: (walletId: string) => Promise<void>;
  backupWallet: (walletId: string) => Promise<void>;
  addAccount: (walletId: string, tokenId: string, name?: string) => Promise<void>;
  deleteAccount: (accountId: string) => Promise<void>;
  fetchBalance: (walletId: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  mnemonic: null,
  isBackedUp: false,
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

  /** Load local state from SecureStore */
  loadLocalState: async () => {
    try {
      const isBackedUpStr = await SecureStore.getItemAsync(IS_BACKED_UP_KEY);
      const hasWalletsStr = await SecureStore.getItemAsync(HAS_WALLETS_KEY);

      if (hasWalletsStr === "true") {
        set({
          mnemonic: null,
          isBackedUp: isBackedUpStr === "true",
          hasWallets: true,
          hasFetched: true,
        });
        await get().fetchWallets();
      } else {
        set({ hasFetched: true, hasWallets: false });
      }
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

      set({
        wallets,
        activeWallet: active,
        accounts,
        activeAccount: accounts[0] || null,
        accountCount: accounts.length,
        hasWallets: wallets.length > 0,
        hasFetched: true,
      });

      // If server returns empty wallet list, clear local flags
      // so the app redirects to Start (wallet creation guide) page
      if (wallets.length === 0) {
        await SecureStore.deleteItemAsync(HAS_WALLETS_KEY);
        await SecureStore.deleteItemAsync(IS_BACKED_UP_KEY);
      }
    } catch (err: any) {
      // If device not registered (401) or server unreachable, reset local state
      // so the app redirects to Start (wallet creation guide) page
      const status = err?.response?.status;
      const errorMsg = err?.response?.data?.error;
      if (status === 401 || errorMsg === "Device not registered") {
        // Device was cleared on server side — reset local wallet state
        await SecureStore.deleteItemAsync(HAS_WALLETS_KEY);
        await SecureStore.deleteItemAsync(IS_BACKED_UP_KEY);
        set({
          hasWallets: false,
          wallets: [],
          activeWallet: null,
          accounts: [],
          activeAccount: null,
          isBackedUp: false,
          hasFetched: true,
        });
      } else {
        // Other errors — keep local state, just mark fetch done
        set({ hasFetched: true });
      }
    }
    set({ loading: false });
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
  setActiveWallet: (wallet: Wallet) => {
    set({ activeWallet: wallet, isBackedUp: wallet.isBackedUp });
    get().fetchAccounts(wallet.id);
  },

  /** Set active account */
  setActiveAccount: (account: Account) => {
    set({ activeAccount: account });
  },

  /** Create wallet — generates mnemonic locally, creates on server */
  createWallet: async (alias: string, password: string, passwordHint?: string): Promise<string> => {
    const mnemonic = await generateMnemonic();

    // Create wallet on server with mnemonic for deterministic derivation
    const wallet = await walletService.saveWallet("CREATE", alias, password, passwordHint, mnemonic);

    // Store mnemonic per walletId
    await SecureStore.setItemAsync(mnemonicKey(wallet.id), mnemonic);

    set({
      mnemonic,
      isBackedUp: wallet.isBackedUp,
      hasWallets: true,
    });

    await SecureStore.setItemAsync(HAS_WALLETS_KEY, "true");
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

    await SecureStore.setItemAsync(HAS_WALLETS_KEY, "true");

    set({
      mnemonic: mnemonicInput,
      isBackedUp: wallet.isBackedUp,
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
      // Delete local mnemonic for this wallet
      await SecureStore.deleteItemAsync(mnemonicKey(walletId));
      await walletService.deleteWallet(walletId);
      await get().fetchWallets();
    } catch {
      // silent
    }
  },

  /** Mark wallet as backed up */
  backupWallet: async (walletId: string) => {
    try {
      await walletService.backupWallet(walletId);
      await SecureStore.setItemAsync(IS_BACKED_UP_KEY, "true");
      set({ isBackedUp: true });
      await get().fetchWallets();
    } catch (err: any) {
      throw err;
    }
  },

  /** Add account to wallet */
  addAccount: async (walletId: string, network: string, name?: string) => {
    try {
      // Read mnemonic from SecureStore for deterministic derivation
      let mnemonic: string | undefined;
      try {
        const stored = await SecureStore.getItemAsync(mnemonicKey(walletId));
        if (stored) mnemonic = stored;
      } catch {
        // mnemonic may not be available for CREATE wallets
      }
      await accountService.createAccount(walletId, network, name, mnemonic);
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

  /** Fetch balance for wallet */
  fetchBalance: async (walletId: string) => {
    try {
      const { tokenService } = require("../services/tokenService");
      const [balanceData, tokensData] = await Promise.all([
        tokenService.getBalance(walletId),
        tokenService.getTokenList(walletId),
      ]);
      set({
        totalBalanceUsd: balanceData.totalBalanceUsd || "0",
        tokens: tokensData.tokens,
      });
    } catch {
      // silent
    }
  },

  /** Logout - clear local state */
  logout: async () => {
    // Delete all per-wallet mnemonics
    const { wallets } = get();
    for (const w of wallets) {
      await SecureStore.deleteItemAsync(mnemonicKey(w.id));
    }
    // Also try to delete legacy key
    await SecureStore.deleteItemAsync("aquad_mnemonic");

    await SecureStore.deleteItemAsync(IS_BACKED_UP_KEY);
    await SecureStore.deleteItemAsync(HAS_WALLETS_KEY);
    await SecureStore.deleteItemAsync(ACTIVE_WALLET_KEY);
    set({
      mnemonic: null,
      isBackedUp: false,
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
    });
  },
}));
import { create } from "zustand";
import { walletService } from "../services/walletService";
import { tokenService } from "../services/tokenService";
import type { Wallet, TokenBalance } from "../types";

interface WalletState {
  wallets: Wallet[];
  activeWallet: Wallet | null;
  totalBalanceCny: string;
  totalBalanceUsd: string;
  tokens: TokenBalance[];
  loading: boolean;
  hasFetched: boolean;
  fetchWallets: () => Promise<void>;
  setActiveWallet: (wallet: Wallet) => Promise<void>;
  createWallet: (alias: string) => Promise<void>;
  deleteWallet: (walletId: string) => Promise<void>;
  fetchBalance: (walletId: string) => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  wallets: [],
  activeWallet: null,
  totalBalanceCny: "0",
  totalBalanceUsd: "0",
  tokens: [],
  loading: false,
  hasFetched: false,

  fetchWallets: async () => {
    set({ loading: true });
    try {
      const data = await walletService.getWallets();
      const wallets = data.wallets;
      const active = wallets.find((w) => w.isActive) || wallets[0] || null;
      set({ wallets, activeWallet: active || get().activeWallet, hasFetched: true });
    } catch {
      // silent — don't set hasFetched on error
    }
    set({ loading: false });
  },

  setActiveWallet: async (wallet: Wallet) => {
    try {
      await walletService.activateWallet(wallet.id);
      set({ activeWallet: { ...wallet, isActive: true } });
      await get().fetchWallets();
    } catch {
      // fallback
      set({ activeWallet: wallet });
    }
  },

  createWallet: async (alias: string) => {
    await walletService.createWallet(alias);
    await get().fetchWallets();
  },

  deleteWallet: async (walletId: string) => {
    await walletService.deleteWallet(walletId);
    await get().fetchWallets();
  },

  fetchBalance: async (walletId: string) => {
    try {
      const [balanceData, tokensData] = await Promise.all([
        tokenService.getBalance(walletId),
        tokenService.getTokenList(walletId),
      ]);
      set({
        totalBalanceCny: balanceData.totalBalanceCny,
        totalBalanceUsd: balanceData.totalBalanceUsd || "0",
        tokens: tokensData.tokens,
      });
    } catch {
      // silent
    }
  },
}));
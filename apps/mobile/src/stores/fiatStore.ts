import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { fiatService } from "../services/fiatService";

export interface FiatOption {
  code: string;
  name: string;
  symbol: string;
}

const FIAT_KEY = "imwallet_fiat_currency";

const DEFAULT_FIAT: FiatOption = { code: "CNY", name: "人民币", symbol: "¥" };

const FIAT_NAMES: Record<string, string> = {
  CNY: "人民币",
  USD: "美元",
  EUR: "欧元",
  JPY: "日元",
};

interface FiatState {
  currency: FiatOption;
  availableCurrencies: FiatOption[];
  setCurrency: (code: string) => Promise<void>;
  loadCurrency: () => Promise<void>;
  fetchAvailableCurrencies: () => Promise<void>;
}

export const useFiatStore = create<FiatState>((set, get) => ({
  currency: DEFAULT_FIAT,
  availableCurrencies: [DEFAULT_FIAT],

  setCurrency: async (code: string) => {
    const { availableCurrencies } = get();
    const found = availableCurrencies.find((c) => c.code === code);
    if (found) {
      await AsyncStorage.setItem(FIAT_KEY, code);
      set({ currency: found });
    }
  },

  loadCurrency: async () => {
    try {
      const saved = await AsyncStorage.getItem(FIAT_KEY);
      if (saved) {
        const { availableCurrencies } = get();
        const found = availableCurrencies.find((c) => c.code === saved);
        if (found) {
          set({ currency: found });
        }
      }
    } catch {
      // use default
    }
  },

  fetchAvailableCurrencies: async () => {
    try {
      const rates = await fiatService.getFiatRates();
      const currencies: FiatOption[] = rates.map((r) => ({
        code: r.code,
        name: FIAT_NAMES[r.code] || r.name,
        symbol: r.symbol,
      }));
      set({ availableCurrencies: currencies });
      // Re-apply saved currency if available
      const saved = await AsyncStorage.getItem(FIAT_KEY);
      if (saved) {
        const found = currencies.find((c) => c.code === saved);
        if (found) set({ currency: found });
      }
    } catch {
      // use defaults
    }
  },
}));

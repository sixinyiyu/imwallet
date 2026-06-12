import api from "./api";

export interface FeeConfig {
  feeRate: number;
  feeMode: "EXTRA" | "DEDUCTED";
}

let cachedConfig: FeeConfig | null = null;

export const configService = {
  async getFeeConfig(): Promise<FeeConfig> {
    if (cachedConfig) return cachedConfig;
    const { data } = await api.get("/config/fee");
    cachedConfig = data;
    return cachedConfig!;
  },

  clearCache(): void {
    cachedConfig = null;
  },
};
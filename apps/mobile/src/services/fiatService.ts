import api from "./api";

export interface FiatRate {
  code: string;
  name: string;
  symbol: string;
  rate: string;
}

export const fiatService = {
  async getFiatRates(): Promise<FiatRate[]> {
    const { data } = await api.get("/fiat/rates");
    return data.rates;
  },
};

import prisma from "../config/prisma";

export interface FiatRate {
  code: string;
  name: string;
  symbol: string;
  rate: string;
}

export async function getFiatRates(): Promise<FiatRate[]> {
  const rates = await prisma.fiatCurrency.findMany({
    orderBy: { code: "asc" },
  });

  return rates.map((r) => ({
    code: r.code,
    name: r.name,
    symbol: r.symbol,
    rate: r.rate.toString(),
  }));
}

export async function seedDefaultRates(): Promise<void> {
  const defaults = [
    { code: "USD", name: "US Dollar", symbol: "$", rate: "1.0", decimals: 2 },
    { code: "CNY", name: "人民币", symbol: "¥", rate: "7.25", decimals: 2 },
    { code: "EUR", name: "Euro", symbol: "€", rate: "0.92", decimals: 2 },
    { code: "JPY", name: "Japanese Yen", symbol: "¥", rate: "155.0", decimals: 0 },
  ];

  for (const fiat of defaults) {
    await prisma.fiatCurrency.upsert({
      where: { code: fiat.code },
      update: { rate: fiat.rate },
      create: fiat,
    });
  }
}

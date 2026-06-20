/**
 * 区块链网络（链）枚举
 *
 * 每个枚举值对应 chains 表中的一条记录，表示系统支持的区块网络。
 * 代币通过 Token.network 字段关联到对应的链。
 */
export enum ChainType {
  Bitcoin = "Bitcoin",
  Ethereum = "Ethereum",
  Tron = "Tron",
}

/**
 * 代币类型枚举
 *
 * NATIVE     — 链的原生主币（如 TRX、ETH、BTC）
 * STABLECOIN — 稳定币（如 USDT）
 */
export enum TokenType {
  NATIVE = "NATIVE",
  STABLECOIN = "STABLECOIN",
}

/**
 * 每条链的原生主币符号映射
 */
const NATIVE_TOKEN_SYMBOLS: Record<string, string> = {
  [ChainType.Bitcoin]: "BTC",
  [ChainType.Ethereum]: "ETH",
  [ChainType.Tron]: "TRX",
};

/**
 * 获取指定链的原生主币符号
 * @param chainName - 链名称（如 "Tron"）
 * @returns 原生主币符号（如 "TRX"），未知链返回 "UNKNOWN"
 */
export function getNativeTokenSymbol(chainName: string): string {
  return NATIVE_TOKEN_SYMBOLS[chainName] || "UNKNOWN";
}

/**
 * 每条链的 BIP44 派生路径前缀
 */
const DERIVATION_PATHS: Record<string, string> = {
  [ChainType.Bitcoin]: "m/44'/0'/0'/0",
  [ChainType.Ethereum]: "m/44'/60'/0'/0",
  [ChainType.Tron]: "m/44'/195'/0'/0",
};

/**
 * 获取指定链的 BIP44 派生路径
 * @param chainName - 链名称
 * @returns 派生路径，未知链返回 Ethereum 默认路径
 */
export function getDerivationPath(chainName: string): string {
  return DERIVATION_PATHS[chainName] || DERIVATION_PATHS[ChainType.Ethereum];
}

/**
 * 判断链名称是否为系统支持的链
 */
export function isSupportedChain(chainName: string): boolean {
  return Object.values(ChainType).includes(chainName as ChainType);
}

/**
 * 地址相关工具函数
 *
 * 网络类型统一使用 PascalCase，与数据库 token/account 的 network 字段一致：
 *   Tron / Ethereum / Bitcoin
 */

/** 根据链上地址格式推断网络类型（PascalCase，与数据库一致） */
export function detectNetwork(addr: string): string | null {
  const a = addr.trim();
  if (/^T[A-Za-z0-9]{33}$/.test(a)) return "Tron";        // TRON: T + 33位
  if (/^0x[a-fA-F0-9]{40}$/.test(a)) return "Ethereum";   // EVM: 0x + 40位
  if (/^[13][a-zA-Z0-9]{25,34}$/.test(a)) return "Bitcoin"; // BTC: 1/3 + 25-34位
  if (/^bc1[a-zA-Z0-9]{39,59}$/.test(a)) return "Bitcoin";  // BTC: bc1 + 39-59位
  return null;
}

/** 校验地址格式是否合法 */
export function isValidAddressFormat(addr: string): boolean {
  return detectNetwork(addr) !== null;
}

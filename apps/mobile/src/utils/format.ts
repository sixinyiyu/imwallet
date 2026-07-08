/** 智能去除尾部多余零，至少保留2位小数，至多6位小数：
 * 50.000000→50.00，40.040000→40.04，1.200000→1.20，0.049404→0.049404
 */
export function trimAmount(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  // 先用6位精度
  let s = num.toFixed(6);
  // 从末尾去掉0，直到只剩2位小数为止
  while (s.includes(".") && s.endsWith("0") && s.length - s.indexOf(".") - 1 > 2) {
    s = s.slice(0, -1);
  }
  // 如果没有小数点，补上 .00
  if (!s.includes(".")) s += ".00";
  return s;
}

/** 格式化 CNY 金额：保留2位小数 */
export function formatCny(value: string): string {
  const num = parseFloat(value) || 0;
  return num.toFixed(2);
}

/** 从 unknown error 中提取可读消息（替代 err: any 的 err?.message） */
export function getErrorMessage(err: unknown, fallback: string = "操作失败"): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err || fallback;
  // axios error 结构
  const axiosErr = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
  if (axiosErr?.response?.data?.error) return axiosErr.response.data.error;
  if (axiosErr?.response?.data?.message) return axiosErr.response.data.message;
  if (axiosErr?.message) return axiosErr.message;
  return fallback;
}
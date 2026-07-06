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
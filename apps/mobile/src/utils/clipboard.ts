/**
 * Clipboard 工具 — 统一封装 expo-clipboard，避免各 Screen 重复 require
 *
 * 只负责复制操作，不负责 toast 显示（toast 由调用方处理）
 */

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const Clipboard = require("expo-clipboard");
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

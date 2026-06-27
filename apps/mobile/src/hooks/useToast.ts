import { useState, useCallback } from "react";

/**
 * 通用 Toast hook — 统一管理 toast 显示逻辑
 * 使用方式：const { showToast, toastVisible, toastMsg } = useToast();
 */
export function useToast(duration = 2000) {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), duration);
  }, [duration]);

  return { showToast, toastVisible, toastMsg };
}

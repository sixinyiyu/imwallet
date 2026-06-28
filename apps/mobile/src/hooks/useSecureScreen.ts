/**
 * useSecureScreen — 禁止截图/录屏 hook
 *
 * Android: 设置 FLAG_SECURE，截图/录屏内容变为黑屏
 * iOS: 无法系统级阻止，但监听截图通知并弹出警告
 *
 * 用法：在需要保护的页面组件中调用
 *   useSecureScreen();  // 进入页面自动启用，离开自动禁用
 *
 * 或手动控制：
 *   const { enable, disable } = useSecureScreen();
 *   enable();  // 仅在显示助记词时启用
 *   disable(); // 助记词隐藏后禁用（恢复 Recent Apps 预览）
 */

import { useEffect, useCallback, useRef } from "react";
import { Platform, NativeModules, NativeEventEmitter } from "react-native";

const { SecureScreen } = NativeModules;

/**
 * 在页面生命周期内自动启用/禁用安全模式
 * 进入页面 → enable，离开页面 → disable
 */
export function useSecureScreen() {
  const enabledRef = useRef(false);

  const enable = useCallback(() => {
    if (Platform.OS !== "web" && SecureScreen && !enabledRef.current) {
      SecureScreen.enable();
      enabledRef.current = true;
    }
  }, []);

  const disable = useCallback(() => {
    if (Platform.OS !== "web" && SecureScreen && enabledRef.current) {
      SecureScreen.disable();
      enabledRef.current = false;
    }
  }, []);

  useEffect(() => {
    enable();
    return () => {
      disable();
    };
  }, [enable, disable]);

  return { enable, disable };
}

/**
 * iOS 截图检测 — 监听 onScreenshot 事件
 * 返回一个 listener 注册函数，在组件中调用即可收到截图通知
 *
 * 用法：
 *   useScreenshotDetector((event) => {
 *     Alert.alert("警告", "检测到截图，助记词可能已泄露");
 *   });
 */
export function useScreenshotDetector(onScreenshot: (event: { type: string }) => void) {
  useEffect(() => {
    if (Platform.OS !== "ios" || !SecureScreen) return;

    const emitter = new NativeEventEmitter(SecureScreen);
    const subscription = emitter.addListener("onScreenshot", onScreenshot);

    return () => {
      subscription.remove();
    };
  }, [onScreenshot]);
}

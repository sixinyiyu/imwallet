import { useState, useEffect, useRef } from "react";
import { Animated, Platform, Keyboard } from "react-native";

/**
 * Android: 手动监听键盘高度，返回 animated translateY 值。
 * iOS: 不启用，返回恒定 0（交给 KeyboardAvoidingView 处理）。
 *
 * 用法：
 *   const { keyboardHeight, animatedY } = useKeyboardHeight();
 *   <Animated.View style={{ transform: [{ translateY: animatedY }] }}>
 */
export function useKeyboardHeight(enabled = true) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const animatedY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled || Platform.OS !== "android") return;

    const showSub = Keyboard.addListener("keyboardDidChangeFrame", (e) => {
      const h = e.endCoordinates.height;
      if (h > 0) {
        // 键盘弹出：上移
        setKeyboardHeight(h);
        Animated.timing(animatedY, {
          toValue: -h,
          duration: 200,
          useNativeDriver: false,
        }).start();
      } else {
        // 键盘收起：归位
        setKeyboardHeight(0);
        Animated.timing(animatedY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }).start();
      }
    });

    // 兜底：部分设备 keyboardDidChangeFrame 不触发，补充 keyboardWillShow/Hide
    const showSub2 = Keyboard.addListener("keyboardDidShow", (e) => {
      const h = e.endCoordinates.height;
      setKeyboardHeight(h);
      Animated.timing(animatedY, {
        toValue: -h,
        duration: 200,
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
      Animated.timing(animatedY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      showSub2.remove();
      hideSub.remove();
    };
  }, [enabled, animatedY]);

  return { keyboardHeight, animatedY };
}

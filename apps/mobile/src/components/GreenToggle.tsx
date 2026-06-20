import React, { useEffect, useRef } from "react";
import { TouchableOpacity, Animated, StyleSheet, Platform } from "react-native";

/** 绿色主题自定义开关 */
export function GreenToggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const translateX = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [value]);

  const trackWidth = 48;
  const trackHeight = 28;
  const thumbSize = 24;
  const padding = 2;
  const maxOffset = trackWidth - thumbSize - padding * 2;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onValueChange(!value)}
      style={[
        styles.toggleTrack,
        {
          width: trackWidth,
          height: trackHeight,
          borderRadius: trackHeight / 2,
          backgroundColor: value ? "#287220" : "#D1D5DB",
        },
      ]}
    >
      <Animated.View
        style={[
          styles.toggleThumb,
          {
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            transform: [{
              translateX: translateX.interpolate({
                inputRange: [0, 1],
                outputRange: [padding, maxOffset + padding],
              }),
            }],
          },
        ]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toggleTrack: {
    justifyContent: "center",
    paddingHorizontal: 2,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 2 },
    }),
  },
  toggleThumb: {
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 3 },
    }),
  },
});

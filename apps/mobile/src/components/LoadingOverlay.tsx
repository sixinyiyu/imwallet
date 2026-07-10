import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Modal, Animated, Easing } from "react-native";

/** Loading overlay with rotating dashed circle and stage text */
export function LoadingOverlay({ visible, stage }: { visible: boolean; stage: string }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    const rotate = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.15,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    rotate.start();
    pulseAnim.start();
    return () => {
      rotate.stop();
      pulseAnim.stop();
    };
  }, [visible]);

  const rotateInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.mask}>
        <View style={styles.content}>
          <Animated.View style={[styles.circleWrapper, { transform: [{ rotate: rotateInterpolate }, { scale: pulse }] }]}>
            <View style={styles.dashedCircle} />
          </Animated.View>
          <Text style={styles.text}>{stage || "处理中"}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    justifyContent: "center",
    alignItems: "center",
  },
  circleWrapper: {
    width: 64,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
  },
  dashedCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    borderStyle: "dashed",
  },
  text: {
    position: "absolute",
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});

import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWalletStore } from "../stores/walletStore";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const bgImage = require("../../assets/app_bg.png");

export default function StartScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { loadLocalState } = useWalletStore();

  useEffect(() => {
    loadLocalState();
  }, []);

  // 注意：不再监听 hasWallets 变化来强制 reset 到 Main
  // RootStack 的 initialRouteName 已经根据 hasWallets 决定初始页面
  // 创建钱包流程中的导航由 WalletCreateScreen 自行控制

  return (
    <View style={styles.container}>
      {/* 背景图片：绝对定位铺满，resizeMode="cover" 居中裁切 */}
      <Image
        source={bgImage}
        style={styles.bgImage}
        resizeMode="cover"
      />

      {/* 内容遮罩层 + 操作内容 */}
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Logo 区域：flex:1 占据剩余空间，内容垂直居中 */}
        <View style={styles.logoArea}>
        </View>

        {/* 按钮区域：固定在底部 */}
        <View style={styles.buttonArea}>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate("WalletCreate")}
            activeOpacity={0.7}
          >
            <Text style={styles.createButtonText}>创建钱包</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.importButton}
            onPress={() => navigation.navigate("WalletImport")}
            activeOpacity={0.7}
          >
            <Text style={styles.importButtonText}>导入钱包</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1628",
  },
  bgImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    ...Platform.select({
      web: { objectFit: "cover" },
      default: {},
    }),
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 22, 40, 0.3)",
    justifyContent: "space-between",
  },
  logoArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  buttonArea: {
    paddingHorizontal: 32,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 16,
  },
  createButton: {
    backgroundColor: "#287220",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  importButton: {
    backgroundColor: "#E8F9B0",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  importButtonText: {
    color: "#287220",
    fontSize: 18,
    fontWeight: "600",
  },
});

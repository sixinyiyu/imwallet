import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { LinearGradient } from "expo-linear-gradient";

type Nav = NativeStackNavigationProp<RootStackParamList, "WalletAddAccount">;
type RouteType = RouteProp<RootStackParamList, "WalletAddAccount">;

const accountImage = require("../../assets/account.png");
const SCREEN_HEIGHT = Dimensions.get("window").height;

export default function WalletAddAccountScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;
  const { addAccount } = useWalletStore();
  const [creating, setCreating] = useState(false);

  const handleAddAccount = async () => {
    if (!walletId) {
      Alert.alert("错误", "钱包ID缺失");
      return;
    }
    setCreating(true);
    try {
      await addAccount(walletId, "default-trx", "TRX Account");
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    } catch (err: any) {
      Alert.alert("添加失败", err.message || "请稍后重试");
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* 上方图片区域 - 占屏幕 3/5 */}
      <View style={styles.imageArea}>
        <Image
          source={accountImage}
          style={styles.heroImage}
          resizeMode="cover"
        />
        {/* 底部渐变过渡，消除分割线 */}
        <LinearGradient
          colors={["transparent", "#F5F6F8"]}
          style={styles.fadeOverlay}
        />
      </View>

      {/* 下方内容区域 - 占屏幕 2/5 */}
      <View style={styles.contentArea}>
        <Text style={styles.title}>为你的钱包添加账户</Text>
        <Text style={styles.desc}>
          你需要添加至少一个账户后开始使用AquaD。当你选择公链和网络后，账户将被建立。
        </Text>

        {/* 底部按钮 */}
        <View style={styles.bottomArea}>
          <TouchableOpacity
            style={[styles.addButton, creating && styles.addButtonDisabled]}
            onPress={handleAddAccount}
            disabled={creating}
            activeOpacity={0.7}
          >
            {creating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.addButtonText}>立即添加账号</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  imageArea: {
    height: SCREEN_HEIGHT * 0.6,
    width: "100%",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  fadeOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  contentArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    justifyContent: "space-between",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 12,
  },
  desc: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 22,
  },
  bottomArea: {
    paddingBottom: 24,
  },
  addButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
});

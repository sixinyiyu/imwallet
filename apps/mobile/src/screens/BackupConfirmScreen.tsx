import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { useAlert } from "../hooks/useAlert";

type Nav = NativeStackNavigationProp<RootStackParamList, "BackupConfirm">;

export default function BackupConfirmScreen() {
  const alert = useAlert();
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const walletId = (route.params as any)?.walletId as string;
  const { backupWallet } = useWalletStore();

  const handleConfirm = async () => {
    try {
      await backupWallet(walletId);
      alert("备份成功", "您的钱包已标记为已备份，现在可以进行转账操作", [
        {
          text: "进入钱包",
          onPress: () => {
            navigation.reset({ index: 0, routes: [{ name: "Main" }] });
          },
        },
      ]);
    } catch (err: any) {
      alert("备份失败", err.message || "请稍后重试");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>确认备份</Text>
        <Text style={styles.subtitle}>
          请确认您已安全保存了助记词。只有备份后才能进行转账操作。
        </Text>
      </View>

      <View style={styles.warningBox}>
        <Text style={styles.warningIcon}>⚠️</Text>
        <Text style={styles.warningText}>
          助记词是恢复钱包的唯一方式，请务必将其写在纸上并妥善保管，切勿截图或在线保存。
        </Text>
      </View>

      <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
        <Text style={styles.confirmButtonText}>我已安全保存助记词</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.cancelButtonText}>稍后再说</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 24,
  },
  header: {
    paddingTop: 60,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
  },
  warningBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
  },
  warningIcon: {
    fontSize: 20,
    color: "#EF4444",
    marginRight: 12,
  },
  warningText: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },
  confirmButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 32,
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 16,
  },
  cancelButtonText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "500",
  },
});
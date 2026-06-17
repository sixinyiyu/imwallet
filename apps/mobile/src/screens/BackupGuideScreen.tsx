import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";

type Nav = NativeStackNavigationProp<RootStackParamList, "BackupGuide">;
type RouteType = RouteProp<RootStackParamList, "BackupGuide">;

export default function BackupGuideScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;

  const handleBackup = () => {
    if (!walletId) return;
    navigation.navigate("BackupMnemonic", { walletId });
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.title}>备份助记词，保障钱包安全</Text>

        {/* Description */}
        <Text style={styles.desc}>
          当更换手机或重装应用时，你将需要助记词（12个英文单词）恢复钱包。为保障钱包安全，请务必尽快完成助记词备份。
        </Text>

        {/* Important reminder */}
        <View style={styles.reminderCard}>
          <Text style={styles.reminderTitle}>重要提醒：</Text>
          <Text style={styles.reminderText}>
            获得助记词等于拥有钱包资产所有权。
          </Text>
        </View>

        {/* How to backup */}
        <Text style={styles.sectionTitle}>如何安全地备份助记词？</Text>

        <View style={styles.tipItem}>
          <Text style={styles.tipDot}>•</Text>
          <Text style={styles.tipText}>
            使用纸笔，按正确次序抄写助记词。
          </Text>
        </View>

        <View style={styles.tipItem}>
          <Text style={styles.tipDot}>•</Text>
          <Text style={styles.tipText}>
            将助记词保管至安全的地方。
          </Text>
        </View>
      </View>

      {/* Bottom button */}
      <View style={styles.bottomArea}>
        <TouchableOpacity
          style={styles.backupBtn}
          onPress={handleBackup}
          activeOpacity={0.7}
        >
          <Text style={styles.backupBtnText}>立即备份</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
    justifyContent: "space-between",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    lineHeight: 30,
    marginBottom: 16,
  },
  desc: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 22,
    marginBottom: 24,
  },
  reminderCard: {
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#92400E",
    marginBottom: 6,
  },
  reminderText: {
    fontSize: 14,
    color: "#92400E",
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
  },
  tipItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 8,
  },
  tipDot: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 22,
  },
  tipText: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 22,
    flex: 1,
  },
  bottomArea: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  backupBtn: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  backupBtnText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
});

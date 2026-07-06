import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";

type Nav = NativeStackNavigationProp<RootStackParamList, "BackupGuide">;
type RouteType = RouteProp<RootStackParamList, "BackupGuide">;

const bookImage = require("../../assets/book.png");

export default function BackupGuideScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;
  const source = route.params?.source;

  const [showDialog, setShowDialog] = useState(false);

  const isFromCreate = source === "create";

  const handleBackup = () => {
    if (!walletId) return;
    navigation.navigate("BackupMnemonic", { walletId });
  };

  const handleSkip = () => {
    setShowDialog(true);
  };

  const handleGiveUp = () => {
    setShowDialog(false);
    // 回到钱包列表界面
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Image source={bookImage} style={styles.icon} resizeMode="contain" />
        </View>

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

      {/* Bottom buttons */}
      <View style={styles.bottomArea}>
        <TouchableOpacity
          style={styles.backupBtn}
          onPress={handleBackup}
          activeOpacity={0.7}
        >
          <Text style={styles.backupBtnText}>立即备份</Text>
        </TouchableOpacity>

        {/* 创建钱包入口才显示"稍后再说" */}
        {isFromCreate && (
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipBtnText}>稍后再说</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 放弃备份确认对话框 */}
      <Modal
        visible={showDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDialog(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowDialog(false)}>
          <View style={dialogStyles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={dialogStyles.centerWrap}>
          <View style={dialogStyles.dialog}>
            <Text style={dialogStyles.dialogTitle}>确定要放弃备份吗？</Text>
            <Text style={dialogStyles.dialogDesc}>
              如未完成助记词备份，你将无法恢复钱包，并可能造成资产损失。
            </Text>
            <View style={dialogStyles.dialogActions}>
              <TouchableOpacity
                style={dialogStyles.returnBtn}
                onPress={() => setShowDialog(false)}
                activeOpacity={0.7}
              >
                <Text style={dialogStyles.returnBtnText}>返回</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={dialogStyles.giveUpBtn}
                onPress={handleGiveUp}
                activeOpacity={0.7}
              >
                <Text style={dialogStyles.giveUpBtnText}>放弃备份</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  iconWrap: {
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  icon: {
    width: 100,
    height: 100,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    lineHeight: 26,
    marginBottom: 12,
  },
  desc: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 16,
  },
  reminderCard: {
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
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
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
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
    paddingBottom: 24,
    gap: 10,
  },
  backupBtn: {
    backgroundColor: "#287220",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  backupBtnText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  skipBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  skipBtnText: {
    color: "#6B7280",
    fontSize: 18,
    fontWeight: "600",
  },
});

const dialogStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  centerWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  dialog: {
    width: "80%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 12,
    textAlign: "center",
  },
  dialogDesc: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  dialogActions: {
    flexDirection: "row",
    gap: 12,
  },
  returnBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  returnBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  giveUpBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
  },
  giveUpBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
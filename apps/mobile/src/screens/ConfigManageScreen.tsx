import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  Keyboard,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { configService, type FeeConfig } from "../services/configService";
import { EditIcon, ChevronRightIcon } from "../components/icons";
import { GreenToggle } from "../components/GreenToggle";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";

export default function ConfigManageScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [feeConfig, setFeeConfig] = useState<FeeConfig | null>(null);
  const [txRestrictWallet, setTxRestrictWallet] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(true);

  // 编辑费率弹窗
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFeeRate, setEditFeeRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [config, allConfigs] = await Promise.all([
        configService.getFeeConfig(),
        configService.getAllConfigs(),
      ]);
      setFeeConfig(config);
      const restrictItem = allConfigs.find((c) => c.key === "tx_restrict_wallet");
      setTxRestrictWallet(restrictItem?.value === "true");
    } catch {
      showToast("加载配置失败");
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadConfig();
    }, [])
  );

  const handleOpenEdit = () => {
    setEditFeeRate(feeConfig ? feeConfig.feeRate.toString() : "");
    setEditError("");
    setShowEditModal(true);
  };

  const handleConfirmEdit = async () => {
    const trimmed = editFeeRate.trim();
    if (!trimmed) {
      setEditError("请输入费率");
      return;
    }
    const numVal = parseFloat(trimmed);
    if (isNaN(numVal) || numVal < 0 || numVal > 1) {
      setEditError("费率必须在 0~1 之间");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      await configService.updateConfig("fee_rate", trimmed);
      await loadConfig();
      setShowEditModal(false);
      showToast("费率已更新");
    } catch (err: any) {
      setEditError(err?.response?.data?.error || "更新失败，请重试");
    }
    setSaving(false);
  };

  const handleToggleTxRestrict = async (value: boolean) => {
    setToggling(true);
    try {
      await configService.updateConfig("tx_restrict_wallet", value ? "true" : "false");
      setTxRestrictWallet(value);
      showToast(value ? "交易限制已开启" : "交易限制已关闭");
    } catch (err: any) {
      showToast(err?.response?.data?.error || "更新失败，请重试");
    }
    setToggling(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#287220" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 费率配置卡片 */}
      <View style={styles.infoCard}>
        {/* 费率 */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>费率</Text>
          <View style={styles.infoRightWithIcon}>
            <Text style={styles.infoValue}>
              {feeConfig ? feeConfig.feeRate.toString() : "—"}
            </Text>
            <TouchableOpacity onPress={handleOpenEdit} activeOpacity={0.6} style={styles.rowIcon}>
              <EditIcon size={18} color="#8899B8" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.infoDivider} />

        {/* 费率模式 */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>费率模式</Text>
          <Text style={styles.infoValue}>
            {feeConfig?.feeMode === "EXTRA" ? "额外支付手续费" : "从金额中扣除"}
          </Text>
        </View>
        <View style={styles.infoDivider} />
        <Text style={styles.cardHint}>
          费率用于计算转账手续费，修改后立即生效。{"\n"}
          例如：费率 0.005 表示 0.5% 的手续费。
        </Text>
      </View>

      {/* 交易限制开关卡片 */}
      <View style={[styles.infoCard, { marginTop: 16 }]}>
        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>交易限制钱包账户</Text>
          </View>
          {toggling ? (
            <ActivityIndicator size="small" color="#287220" />
          ) : (
            <GreenToggle value={txRestrictWallet} onValueChange={handleToggleTxRestrict} />
          )}
        </View>
        <View style={styles.infoDivider} />
        <Text style={styles.cardHint}>
          开启后，仅支持向系统内账户转账，不支持外部链上地址。
        </Text>
      </View>

      {/* 充值管理入口 */}
      <TouchableOpacity
        style={[styles.infoCard, { marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
        onPress={() => navigation.navigate("Recharge")}
        activeOpacity={0.7}
      >
        <Text style={styles.infoLabel}>充值管理</Text>
        <ChevronRightIcon size={18} color="#8899B8" />
      </TouchableOpacity>

      {/* Toast */}
      {toastVisible && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        </View>
      )}

      {/* 编辑费率弹窗 */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>修改费率</Text>
            <Text style={styles.modalDesc}>请输入 0~1 之间的数值，如 0.005 表示 0.5%</Text>
            <TextInput
              style={[styles.modalInput, editError ? styles.modalInputError : null]}
              value={editFeeRate}
              onChangeText={(text) => { setEditFeeRate(text); setEditError(""); }}
              placeholder="如 0.005"
              placeholderTextColor="#C8C9CC"
              keyboardType="decimal-pad"
              autoFocus
            />
            {editError ? <Text style={styles.errorText}>{editError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowEditModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, (saving || !editFeeRate.trim()) ? styles.modalConfirmBtnDisabled : null]}
                onPress={handleConfirmEdit}
                disabled={saving || !editFeeRate.trim()}
                activeOpacity={0.7}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>确认</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6F8", padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F6F8" },
  // Info card (参考钱包详情页样式)
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  infoValue: {
    fontSize: 14,
    color: "#1F2937",
    fontWeight: "500",
  },
  infoRightWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowIcon: { padding: 4 },
  infoDivider: { height: 1, backgroundColor: "#F3F4F6" },
  cardHint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 10,
    lineHeight: 18,
  },
  // Toast
  toastWrap: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toast: {
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  toastText: { color: "#FFFFFF", fontSize: 14 },
  // Modal (参考钱包详情页编辑弹窗样式)
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#1F2937",
    marginBottom: 20,
  },
  modalInputError: { borderColor: "#EF4444" },
  errorText: {
    fontSize: 12,
    color: "#EF4444",
    marginBottom: 12,
    marginTop: -12,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  modalCancelText: { color: "#6B7280", fontWeight: "600" },
  modalConfirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#287220",
    alignItems: "center",
  },
  modalConfirmBtnDisabled: { backgroundColor: "#A5D6A7" },
  modalConfirmText: { color: "#FFFFFF", fontWeight: "600" },
});
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useFiatStore } from "../stores/fiatStore";
import {
  flushPendingLogs,
  getPendingLogCount,
  getLogUploadEnabled,
  setLogUploadEnabled,
} from "../services/logService";
import { configService } from "../services/configService";
import { GreenToggle } from "../components/GreenToggle";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { currency, loadCurrency } = useFiatStore();
  const [pendingCount, setPendingCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [logUploadEnabled, setLogUploadEnabled] = useState(false);

  // 服务配置
  const [serviceConfigEnabled, setServiceConfigEnabled] = useState(false);
  const [managePermitted, setManagePermitted] = useState(false);
  const [showPwdDrawer, setShowPwdDrawer] = useState(false);
  const [pwdInput, setPwdInput] = useState("");
  const [pwdVerifying, setPwdVerifying] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  // 同链多账户
  const [multiAccountEnabled, setMultiAccountEnabled] = useState(false);
  const [togglingMulti, setTogglingMulti] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      loadCurrency();
      loadPendingCount();
      loadLogUploadEnabled();
      loadServiceConfigEnabled();
      loadMultiAccountEnabled();
      loadManagePermitted();
    }, [])
  );

  const loadPendingCount = async () => {
    try {
      const count = await getPendingLogCount();
      setPendingCount(count);
    } catch {
      setPendingCount(-1);
    }
  };

  const loadLogUploadEnabled = async () => {
    const enabled = await getLogUploadEnabled();
    setLogUploadEnabled(enabled);
  };

  const loadServiceConfigEnabled = async () => {
    const enabled = await configService.getServiceConfigEnabled();
    setServiceConfigEnabled(enabled);
  };

  const loadManagePermitted = async () => {
    const valid = await configService.getManagePermitted();
    setManagePermitted(valid);
    if (!valid) {
      setServiceConfigEnabled(false);
      await configService.setServiceConfigEnabled(false);
    }
  };

  const loadMultiAccountEnabled = async () => {
    const enabled = await configService.getMultiAccountEnabled();
    setMultiAccountEnabled(enabled);
  };

  const handleToggleMultiAccount = async (enabled: boolean) => {
    setTogglingMulti(true);
    try {
      await configService.setMultiAccountEnabled(enabled);
      setMultiAccountEnabled(enabled);
    } catch {
      // silent
    }
    setTogglingMulti(false);
  };

  const handleToggleLogUpload = async (enabled: boolean) => {
    setLogUploadEnabled(enabled);
    await setLogUploadEnabled(enabled);
    if (enabled) {
      loadPendingCount();
    }
  };

  // 服务配置开关：开启需密码验证，关闭直接关闭
  const handleToggleServiceConfig = (enabled: boolean) => {
    if (enabled) {
      // 开启 → 弹出密码抽屉
      setPwdInput("");
      setPwdError(null);
      setShowPwdDrawer(true);
    } else {
      // 关闭 → 直接关闭
      setServiceConfigEnabled(false);
      configService.setServiceConfigEnabled(false);
    }
  };

  const handleVerifyPwd = async () => {
    if (!pwdInput.trim()) {
      setPwdError("请输入密码");
      return;
    }
    setPwdVerifying(true);
    setPwdError(null);
    try {
      await configService.verifyServerPassword(pwdInput.trim());
      // 密码正确 → 启用服务配置
      setServiceConfigEnabled(true);
      await configService.setServiceConfigEnabled(true);
      setShowPwdDrawer(false);
      setPwdInput("");
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) {
        setPwdError("密码错误，请重试");
      } else {
        setPwdError(err?.response?.data?.error || "验证失败，请检查网络");
      }
    }
    setPwdVerifying(false);
  };

  const handleClosePwdDrawer = () => {
    setShowPwdDrawer(false);
    setPwdInput("");
    setPwdError(null);
  };

  const handleUploadLogs = async () => {
    setUploading(true);
    setUploadResult(null);
    try {
      await flushPendingLogs();
      const remaining = await getPendingLogCount();
      if (remaining === 0) {
        setUploadResult("✅ 上传成功，所有日志已上报");
      } else {
        setUploadResult(`⚠️ 上传完成，${remaining} 条日志因网络问题未上报，可稍后重试`);
      }
      setPendingCount(remaining);
    } catch (err: any) {
      setUploadResult(`❌ 上传失败: ${err?.message || "未知错误"}`);
    }
    setUploading(false);
  };

  return (
    <View style={styles.container}>
      {/* 法币单位 */}
      <View style={styles.menuItem}>
        <Text style={styles.menuLabel}>法币单位</Text>
        <Text style={styles.menuValue}>
          {currency.symbol} {currency.name}
        </Text>
      </View>

      {/* 同链多账户 */}
      <View style={styles.menuItem}>
        <View style={styles.menuLeft}>
          <Text style={styles.menuLabel}>同链多账户</Text>
          <Text style={styles.menuHint}>开启后添加账户时允许同链创建多个账户</Text>
        </View>
        {togglingMulti ? (
          <ActivityIndicator size="small" color="#287220" />
        ) : (
          <GreenToggle value={multiAccountEnabled} onValueChange={handleToggleMultiAccount} />
        )}
      </View>

      {/* 日志上报 */}
      <View style={styles.menuItem}>
        <View style={styles.menuLeft}>
          <Text style={styles.menuLabel}>日志上报</Text>
          <Text style={styles.menuHint}>开启后可手动上传异常日志</Text>
        </View>
        <GreenToggle value={logUploadEnabled} onValueChange={handleToggleLogUpload} />
      </View>

      {/* 上传异常日志（仅在日志上报开启时显示） */}
      {logUploadEnabled && (
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Text style={styles.menuLabel}>上传异常日志</Text>
            <Text style={styles.menuHint}>
              {pendingCount === -1
                ? "本地日志数量未知"
                : pendingCount > 0
                  ? `${pendingCount} 条待上报`
                  : "无待上报日志"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleUploadLogs}
            disabled={uploading || pendingCount === 0}
            activeOpacity={0.7}
            style={styles.uploadLink}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#287220" />
            ) : (
              <Text style={[styles.uploadLinkText, pendingCount === 0 && styles.uploadLinkTextDisabled]}>
                上传
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* 上传结果提示 */}
      {logUploadEnabled && uploadResult && (
        <View style={styles.resultRow}>
          <Text style={styles.resultText}>{uploadResult}</Text>
        </View>
      )}

      {/* 服务配置开关（仅管理权限有效时可见） */}
      {managePermitted && (
      <View style={styles.menuItem}>
        <View style={styles.menuLeft}>
          <Text style={styles.menuLabel}>服务配置</Text>
          <Text style={styles.menuHint}>开启后可查看服务配置详情</Text>
        </View>
        <GreenToggle value={serviceConfigEnabled} onValueChange={handleToggleServiceConfig} />
      </View>
      )}

      {/* 服务配置详情入口（仅在开关开启时显示） */}
      {serviceConfigEnabled && (
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate("ServiceConfig")}
          activeOpacity={0.7}
        >
          <Text style={styles.menuLabel}>配置详情</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      )}


      {/* 密码输入抽屉 */}
      <Modal
        visible={showPwdDrawer}
        transparent
        animationType="slide"
        onRequestClose={handleClosePwdDrawer}
      >
        <KeyboardAvoidingView
          style={styles.drawerOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.drawerBackdrop} onPress={handleClosePwdDrawer} />
          <View style={styles.drawerContent}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>请输入服务配置密码</Text>
            <TextInput
              style={styles.pwdInput}
              value={pwdInput}
              onChangeText={setPwdInput}
              placeholder="请输入密码"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={handleVerifyPwd}
            />
            {pwdError && <Text style={styles.pwdError}>{pwdError}</Text>}
            <View style={styles.drawerActions}>
              <TouchableOpacity
                style={styles.drawerCancelBtn}
                onPress={handleClosePwdDrawer}
                activeOpacity={0.7}
              >
                <Text style={styles.drawerCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawerConfirmBtn, pwdVerifying && styles.drawerConfirmBtnDisabled]}
                onPress={handleVerifyPwd}
                disabled={pwdVerifying}
                activeOpacity={0.7}
              >
                {pwdVerifying ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.drawerConfirmText}>确认</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", paddingTop: 8 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  menuLeft: { flex: 1 },
  menuLabel: { fontSize: 16, fontWeight: "500", color: "#1F2937" },
  menuValue: { fontSize: 14, color: "#6B7280" },
  menuHint: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
  uploadLink: { marginLeft: 12, paddingVertical: 4, paddingHorizontal: 4 },
  uploadLinkText: { color: "#287220", fontSize: 15, fontWeight: "500" },
  uploadLinkTextDisabled: { color: "#D1D5DB" },
  resultRow: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  resultText: { fontSize: 14, color: "#374151", lineHeight: 20 },
  menuArrow: { fontSize: 20, color: "#D1D5DB", fontWeight: "300" },
  // 密码抽屉样式
  drawerOverlay: { flex: 1, justifyContent: "flex-end" },
  drawerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  drawerContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    paddingTop: 12,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 20,
  },
  drawerTitle: { fontSize: 17, fontWeight: "600", color: "#1F2937", marginBottom: 16 },
  pwdInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1F2937",
  },
  pwdError: { fontSize: 13, color: "#EF4444", marginTop: 8 },
  drawerActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  drawerCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  drawerCancelText: { color: "#6B7280", fontWeight: "600", fontSize: 15 },
  drawerConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#287220",
    alignItems: "center",
  },
  drawerConfirmBtnDisabled: { opacity: 0.6 },
  drawerConfirmText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
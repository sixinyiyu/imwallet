import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { EyeIcon, EyeOffIcon } from "../components/icons";

type Nav = NativeStackNavigationProp<RootStackParamList, "WalletCreate">;

function getPasswordStrength(pwd: string): { level: number; label: string } {
  if (!pwd || pwd.length === 0) return { level: 0, label: "" };
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pwd)) score += 1;

  if (score <= 1) return { level: 1, label: "弱" };
  if (score <= 2) return { level: 2, label: "一般" };
  if (score <= 3) return { level: 3, label: "强" };
  return { level: 4, label: "很好" };
}

export default function WalletCreateScreen() {
  const navigation = useNavigation<Nav>();
  const { createWallet } = useWalletStore();

  const [alias, setAlias] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const isFormValid =
    alias.trim().length > 0 &&
    password.length >= 8 &&
    password === confirmPassword;

  const handleCreate = async () => {
    if (!alias.trim()) return;
    if (password.length < 8) { Alert.alert("提示", "密码至少需要8个字符"); return; }
    if (password !== confirmPassword) { Alert.alert("提示", "两次输入的密码不一致"); return; }

    setLoading(true);
    try {
      const id = await createWallet(alias.trim(), password, passwordHint.trim() || undefined);
      navigation.replace("BackupGuide", { walletId: id });
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.details?.[0]?.message || err.message || "请稍后重试";
      Alert.alert("创建失败", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>创建钱包</Text>
        <Text style={styles.desc}>为你的多账户钱包命名并设置密码保护。你也可以稍后添加更多钱包。</Text>

        <Text style={styles.label}>钱包名称</Text>
        <TextInput
          style={styles.input}
          placeholder="输入1-12个英文字符或1-6个汉字"
          placeholderTextColor="#C8C9CC"
          value={alias}
          onChangeText={setAlias}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={12}
        />

        <Text style={styles.label}>创建密码</Text>
        {/* 密码卡片：输入密码 + 分割线 + 重复密码 */}
        <View style={styles.passwordCard}>
          {/* 输入密码行：白色容器，TextInput透明，右侧强度指示器 */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputField}
              placeholder="输入密码"
              placeholderTextColor="#C8C9CC"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPasswords}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {password.length > 0 && (
              <View style={styles.strengthWrap}>
                <Text style={styles.strengthLabel}>{strength.label}</Text>
                <View style={styles.strengthLines}>
                  {[1, 2, 3, 4].map((i) => (
                    <View key={i} style={[styles.strengthLine, { backgroundColor: strength.level >= i ? "#3B82F6" : "#E5E7EB" }]} />
                  ))}
                </View>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* 重复密码行：白色容器，TextInput透明，右侧眼睛icon */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputField}
              placeholder="重复密码"
              placeholderTextColor="#C8C9CC"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPasswords}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowPasswords(!showPasswords)} activeOpacity={0.6} style={styles.eyeBtn}>
              {showPasswords ? <EyeIcon size={20} color="#8899B8" /> : <EyeOffIcon size={20} color="#C4C5C5" />}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.label}>密码提示（可选）</Text>
        <TextInput
          style={styles.input}
          placeholder="输入提醒文字"
          placeholderTextColor="#C8C9CC"
          value={passwordHint}
          onChangeText={setPasswordHint}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={128}
        />

        <TouchableOpacity
          style={[styles.button, isFormValid ? styles.buttonActive : styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={!isFormValid || loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#8899B8" />
              <Text style={styles.loadingText}>创建中...</Text>
            </View>
          ) : (
            <Text style={[styles.buttonText, isFormValid ? styles.buttonTextActive : styles.buttonTextDisabled]}>创建</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6F8" },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },

  title: { fontSize: 22, fontWeight: "700", color: "#1F2937", marginBottom: 8 },
  desc: { fontSize: 14, color: "#6B7280", lineHeight: 22, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: "500", color: "#2C3E50", marginBottom: 8 },

  // 普通输入框
  input: {
    backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, fontSize: 16, color: "#2C3E50", marginBottom: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },

  // 密码卡片
  passwordCard: {
    backgroundColor: "#FFFFFF", borderRadius: 12, marginBottom: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
    overflow: "hidden",
  },

  // 输入行容器（与 WalletImportScreen 的 inputRow 同模式）
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  inputField: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: "#2C3E50",
    backgroundColor: "transparent",
    borderWidth: 0,
  },

  // 强度指示器：文字在上，4条短线在下，整体垂直居中
  strengthWrap: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingRight: 14,
  },
  strengthLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#3B82F6",
    marginBottom: 4,
  },
  strengthLines: {
    flexDirection: "column",
    gap: 3,
  },
  strengthLine: {
    width: 16,
    height: 3,
    borderRadius: 1.5,
  },

  divider: { height: 1, backgroundColor: "#EAEBEE" },

  eyeBtn: { padding: 14, paddingLeft: 4 },

  // 创建按钮
  button: { borderRadius: 12, paddingVertical: 16, alignItems: "center", justifyContent: "center", marginTop: 24 },
  buttonActive: { backgroundColor: "#D0E0F8" },
  buttonDisabled: { backgroundColor: "#E5E7EB" },
  buttonText: { fontSize: 18, fontWeight: "600" },
  buttonTextActive: { color: "#8899B8" },
  buttonTextDisabled: { color: "#9CA3AF" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { fontSize: 16, fontWeight: "500", color: "#8899B8" },
});

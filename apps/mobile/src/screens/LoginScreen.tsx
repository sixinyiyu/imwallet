import React, { useState } from "react";
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
import { useAuthStore } from "../stores/authStore";
import { useWalletStore } from "../stores/walletStore";

type Nav = NativeStackNavigationProp<RootStackParamList, "Login">;

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { login } = useAuthStore();
  const { fetchWallets } = useWalletStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert("提示", "请输入用户名和密码");
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
      await fetchWallets();
      // 登录成功后导航由 RootStack key 变化自动处理
      // 无钱包时由 WalletScreen 检测并跳转到 WalletCreate
    } catch (err: any) {
      const message = err?.response?.data?.error || err.message || "登录失败";
      const code = err?.response?.data?.code || "";

      if (code === "AUTH_FAILED") {
        Alert.alert("登录失败", "用户名或密码错误，请检查后重试");
      } else if (code === "ACCOUNT_PENDING") {
        Alert.alert(
          "账号待审核",
          "您的账号尚未通过管理员审核激活，请耐心等待审核通过后再登录。"
        );
      } else if (code === "ACCOUNT_REJECTED") {
        Alert.alert(
          "账号已拒绝",
          "您的账号审核未通过，请联系管理员了解详情。"
        );
      } else if (code === "ACCOUNT_DELETED") {
        Alert.alert("账号已删除", "该账号已被管理员删除，无法登录。");
      } else if (message.includes("pending") || message.includes("审核")) {
        Alert.alert(
          "账号待审核",
          "您的账号尚未通过管理员审核激活，请耐心等待审核通过后再登录。"
        );
      } else {
        Alert.alert("登录失败", message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.logo}>imwallet</Text>
          <Text style={styles.subtitle}>钱包的守护者</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>用户名</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入用户名"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>密码</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              placeholder="请输入密码"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
              activeOpacity={0.6}
            >
              <Text style={styles.eyeIcon}>{showPassword ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>登录</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate("Register")}
          >
            <Text style={styles.linkText}>还没有账号？立即注册</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  header: { alignItems: "center", marginBottom: 40 },
  logo: { fontSize: 32, fontWeight: "700", color: "#1F2937" },
  subtitle: { fontSize: 14, color: "#6B7280", marginTop: 8 },
  form: { width: "100%" },
  label: { fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 6 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    marginBottom: 16,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
  },
  eyeButton: {
    padding: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  eyeIcon: {
    fontSize: 18,
  },
  button: {
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  linkButton: { alignItems: "center", marginTop: 20 },
  linkText: { color: "#3B82F6", fontSize: 14 },
});
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

type Nav = NativeStackNavigationProp<RootStackParamList, "Register">;

export default function RegisterScreen() {
  const navigation = useNavigation<Nav>();
  const { register } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!username.trim()) {
      Alert.alert("提示", "请输入用户名");
      return;
    }
    if (username.trim().length < 3) {
      Alert.alert("提示", "用户名至少3个字符");
      return;
    }
    if (password.length < 8) {
      Alert.alert("提示", "密码至少8个字符");
      return;
    }
    if (password !== confirmPw) {
      Alert.alert("提示", "两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      await register(username.trim(), password);
      Alert.alert(
        "注册成功",
        "您的账号已提交注册，需要管理员审核激活后才能登录。请耐心等待审核通知。",
        [
          {
            text: "返回登录",
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (err: any) {
      Alert.alert("注册失败", err.message || "请稍后重试");
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
        <Text style={styles.title}>创建账号</Text>
        <Text style={styles.subtitle}>注册一个新的钱包账号</Text>

        <View style={styles.noticeBox}>
          <Text style={styles.noticeIcon}>ℹ️</Text>
          <Text style={styles.noticeText}>
            新注册账号需要管理员审核激活后方可登录使用
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>用户名</Text>
          <TextInput
            style={styles.input}
            placeholder="3-32位字母、数字或下划线"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.label}>密码</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              placeholder="至少8位密码"
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
          <Text style={styles.label}>确认密码</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              placeholder="再次输入密码"
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry={!showConfirmPw}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmPw(!showConfirmPw)}
              activeOpacity={0.6}
            >
              <Text style={styles.eyeIcon}>{showConfirmPw ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>注册</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.linkText}>已有账号？返回登录</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "700", color: "#1F2937" },
  subtitle: { fontSize: 14, color: "#6B7280", marginTop: 8, marginBottom: 16 },
  noticeBox: {
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  noticeIcon: { fontSize: 16, marginRight: 8 },
  noticeText: { fontSize: 13, color: "#92400E", flex: 1 },
  form: { width: "100%" },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 6,
  },
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

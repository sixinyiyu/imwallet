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
import { useWalletStore } from "../stores/walletStore";

type Nav = NativeStackNavigationProp<RootStackParamList, "WalletCreate">;

export default function WalletCreateScreen() {
  const navigation = useNavigation<Nav>();
  const { createWallet } = useWalletStore();
  const [alias, setAlias] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!alias.trim()) {
      Alert.alert("提示", "请输入钱包别名");
      return;
    }
    setLoading(true);
    try {
      await createWallet(alias.trim());
      Alert.alert("创建成功", "钱包已创建，开始使用吧！", [
        {
          text: "进入钱包",
          onPress: () => {
            navigation.reset({ index: 0, routes: [{ name: "Main" }] });
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert("创建失败", err.message || "请稍后重试");
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
          <Text style={styles.icon}>💰</Text>
          <Text style={styles.title}>创建您的第一个钱包</Text>
          <Text style={styles.subtitle}>
            开始使用前，您需要先创建一个钱包
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>钱包别名</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：我的主钱包"
            value={alias}
            onChangeText={setAlias}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>创建钱包</Text>
            )}
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
  icon: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#1F2937", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#6B7280", marginTop: 8, textAlign: "center", lineHeight: 20 },
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
  button: {
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import api from "../services/api";
import { configService } from "../services/configService";
import { getErrorMessage } from "../utils/format";
import { refreshPerfProbeEnabled } from "../utils/perfProbe";

export default function ServiceConfigScreen() {
  const [serverUrl, setServerUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [perfProbeEnabled, setPerfProbeEnabled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const url =
        process.env.EXPO_PUBLIC_API_URL ||
        Constants.expoConfig?.extra?.apiBaseUrl ||
        "https://imwallet.dpdns.org/api/v1";
      setServerUrl(url);
      configService.getPerfProbeEnabled().then(setPerfProbeEnabled);
    }, [])
  );

  const handleTest = async () => {
    if (!serverUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.get("/config/all", { timeout: 8000 });
      if (res.status === 200) {
        setTestResult("✅ 连接正常");
      } else {
        setTestResult(`⚠️ 服务器返回异常状态码: ${res.status}`);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status) {
        setTestResult(`❌ 连接失败 (HTTP ${status})`);
      } else {
        setTestResult(`❌ 连接失败: ${getErrorMessage(err, "网络不可达")}`);
      }
    }
    setTesting(false);
  };

  const handlePerfProbeToggle = async (value: boolean) => {
    setPerfProbeEnabled(value);
    await configService.setPerfProbeEnabled(value);
    refreshPerfProbeEnabled();
  };

  return (
    <View style={styles.container}>
      {/* 当前服务地址 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>服务地址</Text>
      </View>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="请输入服务地址"
          autoCapitalize="none"
          autoCorrect={false}
          editable={false}
        />
        <Text style={styles.hint}>
          服务地址由应用配置决定，如需修改请联系开发团队
        </Text>
      </View>

      {/* 连接测试 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>连接测试</Text>
      </View>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.testBtn}
          onPress={handleTest}
          disabled={testing}
          activeOpacity={0.7}
        >
          {testing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.testBtnText}>测试连接</Text>
          )}
        </TouchableOpacity>
        {testResult && (
          <Text style={styles.testResult}>{testResult}</Text>
        )}
      </View>

      {/* 性能探测 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>性能探测</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchLabelWrap}>
            <Text style={styles.switchLabel}>开启性能探测</Text>
            <Text style={styles.switchDesc}>
              记录核心业务各步骤耗时并上报，用于排查卡顿问题。关闭后零开销。
            </Text>
          </View>
          <Switch
            value={perfProbeEnabled}
            onValueChange={handlePerfProbeToggle}
            trackColor={{ false: "#D1D5DB", true: "#287220" }}
            thumbColor={Platform.OS === "android" ? (perfProbeEnabled ? "#FFFFFF" : "#F3F4F6") : undefined}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  sectionHeader: { marginTop: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#374151" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  input: {
    fontSize: 14,
    color: "#1F2937",
    fontFamily: "monospace",
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  hint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 10,
    lineHeight: 18,
  },
  testBtn: {
    backgroundColor: "#287220",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  testBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  testResult: {
    fontSize: 14,
    color: "#374151",
    marginTop: 12,
    textAlign: "center",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabelWrap: {
    flex: 1,
    paddingRight: 12,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1F2937",
  },
  switchDesc: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
    lineHeight: 18,
  },
});
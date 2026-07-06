import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { copyToClipboard } from "../utils/clipboard";
import { getDevicePublicKey } from "../services/api";
import { CopyIcon } from "../components/icons";

export default function SecurityScreen() {
  const [deviceId, setDeviceId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDevicePublicKey().then((key) => {
      setDeviceId(key || "");
      setLoading(false);
    });
  }, []);

  const handleCopy = useCallback(async () => {
    if (!deviceId) return;
    const ok = await copyToClipboard(deviceId);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [deviceId]);

  return (
    <View style={styles.container}>
      {/* 设备标识 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>设备标识</Text>
      </View>
      <View style={styles.card}>
        {loading ? (
          <ActivityIndicator size="small" color="#9CA3AF" style={{ paddingVertical: 14 }} />
        ) : (
          <TouchableOpacity
            style={styles.deviceRow}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            <Text style={styles.deviceId} numberOfLines={1} ellipsizeMode="middle">
              {deviceId || "未获取到设备标识"}
            </Text>
            <View style={styles.copyWrap}>
              {copied ? (
                <Text style={styles.copiedText}>已复制</Text>
              ) : (
                <CopyIcon size={18} color="#8899B8" />
              )}
            </View>
          </TouchableOpacity>
        )}
        <Text style={styles.hint}>
          设备标识用于服务端身份验证，点击可复制
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", paddingTop: 8 },
  sectionHeader: { marginTop: 8, marginBottom: 8, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#374151" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deviceId: {
    flex: 1,
    fontSize: 14,
    color: "#1F2937",
    fontFamily: "monospace",
  },
  copyWrap: { marginLeft: 12, paddingVertical: 4, paddingHorizontal: 4 },
  copiedText: { fontSize: 12, color: "#287220", fontWeight: "500" },
  hint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 10,
    lineHeight: 18,
  },
});
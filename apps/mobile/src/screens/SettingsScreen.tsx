import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useFiatStore } from "../stores/fiatStore";
import { flushPendingLogs, getPendingLogCount } from "../services/logService";

export default function SettingsScreen() {
  const { currency, loadCurrency } = useFiatStore();
  const [pendingCount, setPendingCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  useEffect(() => {
    loadCurrency();
    loadPendingCount();
  }, []);

  const loadPendingCount = async () => {
    try {
      const count = await getPendingLogCount();
      setPendingCount(count);
    } catch {
      setPendingCount(-1); // unknown
    }
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

      {/* 上传异常日志 */}
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

      {/* 上传结果提示 */}
      {uploadResult && (
        <View style={styles.resultRow}>
          <Text style={styles.resultText}>{uploadResult}</Text>
        </View>
      )}
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
  uploadLink: {
    marginLeft: 12,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
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
});
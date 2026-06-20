import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useFiatStore } from "../stores/fiatStore";
import {
  flushPendingLogs,
  getPendingLogCount,
  getLogUploadEnabled,
  setLogUploadEnabled,
} from "../services/logService";

/** 绿色主题自定义开关 */
function GreenToggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const translateX = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [value]);

  const trackWidth = 48;
  const trackHeight = 28;
  const thumbSize = 24;
  const padding = 2;
  const maxOffset = trackWidth - thumbSize - padding * 2;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onValueChange(!value)}
      style={[
        styles.toggleTrack,
        {
          width: trackWidth,
          height: trackHeight,
          borderRadius: trackHeight / 2,
          backgroundColor: value ? "#287220" : "#D1D5DB",
        },
      ]}
    >
      <Animated.View
        style={[
          styles.toggleThumb,
          {
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            transform: [{
              translateX: translateX.interpolate({
                inputRange: [0, 1],
                outputRange: [padding, maxOffset + padding],
              }),
            }],
          },
        ]}
      />
    </TouchableOpacity>
  );
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { currency, loadCurrency } = useFiatStore();
  const [pendingCount, setPendingCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [logUploadEnabled, setLogUploadEnabled] = useState(false);

  useEffect(() => {
    loadCurrency();
    loadPendingCount();
    loadLogUploadEnabled();
  }, []);

  const loadPendingCount = async () => {
    try {
      const count = await getPendingLogCount();
      setPendingCount(count);
    } catch {
      setPendingCount(-1); // unknown
    }
  };

  const loadLogUploadEnabled = async () => {
    const enabled = await getLogUploadEnabled();
    setLogUploadEnabled(enabled);
  };

  const handleToggleLogUpload = async (enabled: boolean) => {
    setLogUploadEnabled(enabled);
    await setLogUploadEnabled(enabled);
    if (enabled) {
      // 开启时刷新待上报数量
      loadPendingCount();
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

      {/* 日志上报 */}
      <View style={styles.menuItem}>
        <View style={styles.menuLeft}>
          <Text style={styles.menuLabel}>日志上报</Text>
          <Text style={styles.menuHint}>
            开启后可手动上传异常日志
          </Text>
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

      {/* 服务配置 */}
      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => navigation.navigate("ServiceConfig")}
        activeOpacity={0.7}
      >
        <Text style={styles.menuLabel}>服务配置</Text>
        <Text style={styles.menuArrow}>›</Text>
      </TouchableOpacity>
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
  menuArrow: { fontSize: 20, color: "#D1D5DB", fontWeight: "300" },
  // 自定义开关样式
  toggleTrack: {
    justifyContent: "center",
    paddingHorizontal: 2,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 2 },
    }),
  },
  toggleThumb: {
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 3 },
    }),
  },
});
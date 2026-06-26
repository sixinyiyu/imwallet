import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { adminService, type DeviceInfo, type DeviceTransaction, type DeviceRecharge } from "../services/adminService";
import { ChevronRightIcon } from "../components/icons";
import { formatTime } from "../utils/date";

export default function DeviceManageScreen() {
  // 设备管理
  const [adminPwd, setAdminPwd] = useState("");
  const [adminVerified, setAdminVerified] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [deviceTransactions, setDeviceTransactions] = useState<DeviceTransaction[]>([]);
  const [deviceRecharges, setDeviceRecharges] = useState<DeviceRecharge[]>([]);
  const [deviceDataLoading, setDeviceDataLoading] = useState(false);
  const [deviceDataTab, setDeviceDataTab] = useState<"transactions" | "recharges">("transactions");
  const [deviceDataOffset, setDeviceDataOffset] = useState(0);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  const handleVerifyAdmin = async () => {
    if (!adminPwd.trim()) return;
    setDevicesLoading(true);
    try {
      const list = await adminService.listDevices(adminPwd.trim());
      setDevices(list);
      setAdminVerified(true);
    } catch {
      showToast("密码验证失败");
    }
    setDevicesLoading(false);
  };

  const handleSelectDevice = async (deviceId: string) => {
    if (selectedDevice === deviceId) {
      setSelectedDevice(null);
      return;
    }
    setSelectedDevice(deviceId);
    setDeviceDataOffset(0);
    setDeviceDataTab("transactions");
    setDeviceDataLoading(true);
    try {
      const [txns, recharges] = await Promise.all([
        adminService.getDeviceTransactions(deviceId, adminPwd, 0),
        adminService.getDeviceRecharges(deviceId, adminPwd, 0),
      ]);
      setDeviceTransactions(txns);
      setDeviceRecharges(recharges);
    } catch {
      showToast("加载设备数据失败");
    }
    setDeviceDataLoading(false);
  };

  const handleLoadMoreDeviceData = async () => {
    if (!selectedDevice) return;
    const nextOffset = deviceDataOffset + 20;
    setDeviceDataOffset(nextOffset);
    setDeviceDataLoading(true);
    try {
      if (deviceDataTab === "transactions") {
        const more = await adminService.getDeviceTransactions(selectedDevice, adminPwd, nextOffset);
        setDeviceTransactions((prev) => [...prev, ...more]);
      } else {
        const more = await adminService.getDeviceRecharges(selectedDevice, adminPwd, nextOffset);
        setDeviceRecharges((prev) => [...prev, ...more]);
      }
    } catch {
      showToast("加载更多失败");
    }
    setDeviceDataLoading(false);
  };

  const shortId = (id: string) => id.length > 16 ? `${id.slice(0, 8)}...${id.slice(-8)}` : id;

  /** 格式化 lastActiveAt：有值则显示时间，无值则显示"从未活跃" */
  const formatLastActive = (iso: string | null) => {
    if (!iso) return "从未活跃";
    const formatted = formatTime(iso);
    return formatted === "--" ? "从未活跃" : formatted;
  };

  return (
    <View style={styles.container}>
      {!adminVerified ? (
        <View style={styles.verifyCard}>
          <Text style={styles.verifyTitle}>设备管理</Text>
          <Text style={styles.verifyDesc}>
            查看设备活跃情况及钱包信息，需要输入管理密码验证身份。
          </Text>
          <View style={styles.adminPwdRow}>
            <TextInput
              style={styles.adminPwdInput}
              value={adminPwd}
              onChangeText={setAdminPwd}
              placeholder="输入管理密码"
              placeholderTextColor="#C8C9CC"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.adminPwdBtn, (!adminPwd.trim() || devicesLoading) && styles.adminPwdBtnDisabled]}
              onPress={handleVerifyAdmin}
              disabled={!adminPwd.trim() || devicesLoading}
              activeOpacity={0.7}
            >
              {devicesLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.adminPwdBtnText}>验证</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {devices.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>暂无设备</Text>
            </View>
          ) : (
            <FlatList
              data={devices}
              keyExtractor={(d) => d.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item: d }) => (
                <View style={styles.deviceCard}>
                  <TouchableOpacity
                    style={styles.deviceRow}
                    onPress={() => handleSelectDevice(d.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.deviceInfo}>
                      <View style={styles.deviceNameRow}>
                        <Text style={styles.deviceId}>{shortId(d.id)}</Text>
                        <View style={[styles.onlineBadge, d.online ? styles.onlineBadgeOn : styles.onlineBadgeOff]}>
                          <Text style={[styles.onlineBadgeText, d.online ? styles.onlineBadgeTextOn : styles.onlineBadgeTextOff]}>
                            {d.online ? "在线" : "离线"}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.deviceMeta}>
                        {d.platform} · {d.walletCount} 个钱包 · {formatLastActive(d.lastActiveAt)}
                      </Text>
                    </View>
                    <ChevronRightIcon size={16} color="#8899B8" />
                  </TouchableOpacity>

                  {/* 展开的设备数据 */}
                  {selectedDevice === d.id && (
                    <View style={styles.deviceDataPanel}>
                      {deviceDataLoading ? (
                        <ActivityIndicator size="small" color="#287220" style={{ marginVertical: 12 }} />
                      ) : (
                        <>
                          {/* Tab 切换 */}
                          <View style={styles.dataTabRow}>
                            <TouchableOpacity
                              style={[styles.dataTab, deviceDataTab === "transactions" && styles.dataTabActive]}
                              onPress={() => setDeviceDataTab("transactions")}
                            >
                              <Text style={[styles.dataTabText, deviceDataTab === "transactions" && styles.dataTabTextActive]}>交易</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.dataTab, deviceDataTab === "recharges" && styles.dataTabActive]}
                              onPress={() => setDeviceDataTab("recharges")}
                            >
                              <Text style={[styles.dataTabText, deviceDataTab === "recharges" && styles.dataTabTextActive]}>充值</Text>
                            </TouchableOpacity>
                          </View>

                          {deviceDataTab === "transactions" ? (
                            deviceTransactions.length === 0 ? (
                              <Text style={styles.emptyText}>暂无交易记录</Text>
                            ) : (
                              deviceTransactions.map((t) => (
                                <View key={t.id} style={styles.dataItem}>
                                  <View style={styles.dataItemRow}>
                                    <Text style={styles.dataItemSymbol}>{t.tokenSymbol}</Text>
                                    <Text style={styles.dataItemAmount}>{t.amount}</Text>
                                  </View>
                                  <Text style={styles.dataItemMeta}>
                                    {t.status} · {formatTime(t.createdAt)}
                                  </Text>
                                </View>
                              ))
                            )
                          ) : (
                            deviceRecharges.length === 0 ? (
                              <Text style={styles.emptyText}>暂无充值记录</Text>
                            ) : (
                              deviceRecharges.map((r) => (
                                <View key={r.id} style={styles.dataItem}>
                                  <View style={styles.dataItemRow}>
                                    <Text style={styles.dataItemSymbol}>{r.tokenSymbol}</Text>
                                    <Text style={styles.dataItemAmount}>{r.amount}</Text>
                                  </View>
                                  <Text style={styles.dataItemMeta}>
                                    {r.walletAlias} · {formatTime(r.createdAt)}
                                  </Text>
                                </View>
                              ))
                            )
                          )}
                          {/* 加载更多 */}
                          <TouchableOpacity
                            style={styles.loadMoreBtn}
                            onPress={handleLoadMoreDeviceData}
                            disabled={deviceDataLoading}
                            activeOpacity={0.7}
                          >
                            {deviceDataLoading ? (
                              <ActivityIndicator size="small" color="#287220" />
                            ) : (
                              <Text style={styles.loadMoreBtnText}>加载更多</Text>
                            )}
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}
                </View>
              )}
            />
          )}
        </>
      )}

      {/* Toast */}
      {toastVisible && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6F8" },
  // 验证卡片
  verifyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    margin: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  verifyTitle: { fontSize: 15, fontWeight: "600", color: "#374151", marginBottom: 8 },
  verifyDesc: { fontSize: 13, color: "#9CA3AF", lineHeight: 18, marginBottom: 16 },
  adminPwdRow: { flexDirection: "row", gap: 8 },
  adminPwdInput: {
    flex: 1, borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10,
    padding: 12, fontSize: 15, color: "#1F2937",
  },
  adminPwdBtn: {
    backgroundColor: "#287220", borderRadius: 10, padding: 12,
    alignItems: "center", justifyContent: "center", minWidth: 64,
  },
  adminPwdBtnDisabled: { backgroundColor: "#A5D6A7" },
  adminPwdBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  // 设备列表
  listContent: { padding: 16 },
  deviceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  deviceRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  deviceInfo: { flex: 1 },
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  deviceId: { fontSize: 14, fontWeight: "500", color: "#1F2937" },
  onlineBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  onlineBadgeOn: { backgroundColor: "#E8F5E9" },
  onlineBadgeOff: { backgroundColor: "#F3F4F6" },
  onlineBadgeText: { fontSize: 11, fontWeight: "500" },
  onlineBadgeTextOn: { color: "#287220" },
  onlineBadgeTextOff: { color: "#9CA3AF" },
  deviceMeta: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
  // 设备数据面板
  deviceDataPanel: {
    backgroundColor: "#F9FAFB", borderRadius: 8, padding: 12, marginTop: 12,
  },
  dataTabRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  dataTab: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6,
    backgroundColor: "#F3F4F6",
  },
  dataTabActive: { backgroundColor: "#287220" },
  dataTabText: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  dataTabTextActive: { color: "#FFFFFF" },
  dataItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  dataItemRow: { flexDirection: "row", justifyContent: "space-between" },
  dataItemSymbol: { fontSize: 14, fontWeight: "500", color: "#1F2937" },
  dataItemAmount: { fontSize: 14, color: "#1F2937" },
  dataItemMeta: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  emptyCard: {
    backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, margin: 16,
  },
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center", paddingVertical: 12 },
  loadMoreBtn: { paddingVertical: 10, alignItems: "center" },
  loadMoreBtnText: { fontSize: 13, color: "#287220", fontWeight: "500" },
  // Toast
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
});

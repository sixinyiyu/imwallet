import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { configService, type FeeConfig } from "../services/configService";
import { adminService, type DeviceInfo, type DeviceTransaction, type DeviceRecharge } from "../services/adminService";
import { EditIcon, ChevronRightIcon } from "../components/icons";
import { GreenToggle } from "../components/GreenToggle";
import { ConfigManageSkeleton } from "../components/Skeleton";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { formatTime } from "../utils/date";

export default function ConfigManageScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [feeConfig, setFeeConfig] = useState<FeeConfig | null>(null);
  const [txRestrictWallet, setTxRestrictWallet] = useState(false);
  const [loading, setLoading] = useState(true);

  // 编辑费率弹窗（含密码输入）
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFeeRate, setEditFeeRate] = useState("");
  const [editPwd, setEditPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // 交易限制开关密码抽屉
  const [showTogglePwdDrawer, setShowTogglePwdDrawer] = useState(false);
  const [togglePwdInput, setTogglePwdInput] = useState("");
  const [togglePwdVerifying, setTogglePwdVerifying] = useState(false);
  const [togglePwdError, setTogglePwdError] = useState<string | null>(null);
  const [pendingToggleValue, setPendingToggleValue] = useState<boolean | null>(null);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

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

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [config, allConfigs] = await Promise.all([
        configService.getFeeConfig(),
        configService.getAllConfigs(),
      ]);
      setFeeConfig(config);
      const restrictItem = allConfigs.find((c) => c.key === "tx_restrict_wallet");
      setTxRestrictWallet(restrictItem?.value === "true");
    } catch {
      showToast("加载配置失败");
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadConfig();
    }, [])
  );

  // ── 费率编辑 ──

  const handleOpenEdit = () => {
    setEditFeeRate(feeConfig ? feeConfig.feeRate.toString() : "");
    setEditPwd("");
    setEditError("");
    setShowEditModal(true);
  };

  const handleConfirmEdit = async () => {
    const trimmed = editFeeRate.trim();
    if (!trimmed) {
      setEditError("请输入费率");
      return;
    }
    const numVal = parseFloat(trimmed);
    if (isNaN(numVal) || numVal < 0 || numVal > 1) {
      setEditError("费率必须在 0~1 之间");
      return;
    }
    if (!editPwd.trim()) {
      setEditError("请输入管理密码");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      await configService.updateConfig("fee_rate", trimmed, editPwd.trim());
      await loadConfig();
      setShowEditModal(false);
      showToast("费率已更新");
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) {
        setEditError("管理密码错误");
      } else {
        setEditError(err?.response?.data?.error || "更新失败，请重试");
      }
    }
    setSaving(false);
  };

  // ── 交易限制开关 ──

  const handleToggleTxRestrict = (value: boolean) => {
    // 弹出密码抽屉，记录待切换的目标值
    setPendingToggleValue(value);
    setTogglePwdInput("");
    setTogglePwdError(null);
    setShowTogglePwdDrawer(true);
  };

  const handleConfirmTogglePwd = async () => {
    if (!togglePwdInput.trim()) {
      setTogglePwdError("请输入密码");
      return;
    }
    if (pendingToggleValue === null) return;
    setTogglePwdVerifying(true);
    setTogglePwdError(null);
    try {
      const value = pendingToggleValue;
      await configService.updateConfig("tx_restrict_wallet", value ? "true" : "false", togglePwdInput.trim());
      setTxRestrictWallet(value);
      showToast(value ? "交易限制已开启" : "交易限制已关闭");
      setShowTogglePwdDrawer(false);
      setTogglePwdInput("");
      setPendingToggleValue(null);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) {
        setTogglePwdError("密码错误，请重试");
      } else {
        setTogglePwdError(err?.response?.data?.error || "更新失败，请重试");
      }
    }
    setTogglePwdVerifying(false);
  };

  const handleCloseTogglePwdDrawer = () => {
    setShowTogglePwdDrawer(false);
    setTogglePwdInput("");
    setTogglePwdError(null);
    setPendingToggleValue(null);
  };

  // ── 设备管理 ──

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

  if (loading) {
    return (
      <View style={styles.container}>
        <ConfigManageSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 费率配置卡片 */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>费率</Text>
          <View style={styles.infoRightWithIcon}>
            <Text style={styles.infoValue}>
              {feeConfig ? feeConfig.feeRate.toString() : "—"}
            </Text>
            <TouchableOpacity onPress={handleOpenEdit} activeOpacity={0.6} style={styles.rowIcon}>
              <EditIcon size={18} color="#8899B8" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.infoDivider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>费率模式</Text>
          <Text style={styles.infoValue}>
            {feeConfig?.feeMode === "EXTRA" ? "额外支付手续费" : "从金额中扣除"}
          </Text>
        </View>
        <View style={styles.infoDivider} />
        <Text style={styles.cardHint}>
          费率用于计算转账手续费，修改后立即生效。{"\n"}
          例如：费率 0.005 表示 0.5% 的手续费。
        </Text>
      </View>

      {/* 交易限制开关卡片 */}
      <View style={[styles.infoCard, { marginTop: 16 }]}>
        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoLabel}>交易限制钱包账户</Text>
          </View>
            <GreenToggle value={txRestrictWallet} onValueChange={handleToggleTxRestrict} />
        </View>
        <View style={styles.infoDivider} />
        <Text style={styles.cardHint}>
          开启后，仅支持向系统内账户转账，不支持外部链上地址。
        </Text>
      </View>

      {/* 充值管理入口 */}
      <TouchableOpacity
        style={[styles.infoCard, { marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
        onPress={() => navigation.navigate("Recharge")}
        activeOpacity={0.7}
      >
        <Text style={styles.infoLabel}>充值管理</Text>
        <ChevronRightIcon size={18} color="#8899B8" />
      </TouchableOpacity>

      {/* 代币管理入口 */}
      <TouchableOpacity
        style={[styles.infoCard, { marginTop: 12 }]}
        onPress={() => navigation.navigate("TokenManage")}
        activeOpacity={0.7}
      >
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>代币管理</Text>
          <ChevronRightIcon size={18} color="#8899B8" />
        </View>
        <View style={styles.infoDivider} />
        <Text style={styles.cardHint}>
          可以配置钱包可管理哪些区块链网络，开启后可以创建对应区块链账户。
        </Text>
      </TouchableOpacity>

      {/* ── 设备管理区块 ── */}
      <View style={[styles.infoCard, { marginTop: 12 }]}>
        <Text style={styles.sectionTitle}>设备管理</Text>

        {!adminVerified ? (
          <View style={styles.adminPwdRow}>
            <TextInput
              style={styles.adminPwdInput}
              value={adminPwd}
              onChangeText={setAdminPwd}
              placeholder="输入管理密码"
              placeholderTextColor="#C8C9CC"
              secureTextEntry
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
        ) : (
          <>
            {devices.length === 0 ? (
              <Text style={styles.emptyText}>暂无设备</Text>
            ) : (
              devices.map((d) => (
                <View key={d.id}>
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
                        {d.platform} · {d.walletCount} 个钱包 · {d.lastActiveAt ? formatTime(d.lastActiveAt) : "从未活跃"}
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
              ))
            )}
          </>
        )}
      </View>

      {/* Toast */}
      {toastVisible && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        </View>
      )}

      {/* 编辑费率弹窗（含密码输入） */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>修改费率</Text>
            <Text style={styles.modalDesc}>请输入 0~1 之间的数值，如 0.005 表示 0.5%</Text>
            <TextInput
              style={[styles.modalInput, editError ? styles.modalInputError : null]}
              value={editFeeRate}
              onChangeText={(text) => { setEditFeeRate(text); setEditError(""); }}
              placeholder="如 0.005"
              placeholderTextColor="#C8C9CC"
              keyboardType="decimal-pad"
              autoFocus
            />
            <Text style={styles.modalPwdLabel}>管理密码</Text>
            <TextInput
              style={[styles.modalInput, editError ? styles.modalInputError : null]}
              value={editPwd}
              onChangeText={(text) => { setEditPwd(text); setEditError(""); }}
              placeholder="请输入管理密码"
              placeholderTextColor="#C8C9CC"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            {editError ? <Text style={styles.errorText}>{editError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowEditModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, (saving || !editFeeRate.trim() || !editPwd.trim()) ? styles.modalConfirmBtnDisabled : null]}
                onPress={handleConfirmEdit}
                disabled={saving || !editFeeRate.trim() || !editPwd.trim()}
                activeOpacity={0.7}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>确认</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 交易限制开关密码抽屉 */}
      <Modal
        visible={showTogglePwdDrawer}
        transparent
        animationType="slide"
        onRequestClose={handleCloseTogglePwdDrawer}
      >
        <KeyboardAvoidingView
          style={styles.drawerOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.drawerBackdrop} onPress={handleCloseTogglePwdDrawer} />
          <View style={styles.drawerContent}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>请输入管理密码</Text>
            <Text style={styles.drawerDesc}>
              {pendingToggleValue ? "开启交易限制需要验证管理密码" : "关闭交易限制需要验证管理密码"}
            </Text>
            <TextInput
              style={styles.pwdInput}
              value={togglePwdInput}
              onChangeText={setTogglePwdInput}
              placeholder="请输入密码"
              placeholderTextColor="#C8C9CC"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={handleConfirmTogglePwd}
            />
            {togglePwdError && <Text style={styles.pwdError}>{togglePwdError}</Text>}
            <View style={styles.drawerActions}>
              <TouchableOpacity
                style={styles.drawerCancelBtn}
                onPress={handleCloseTogglePwdDrawer}
                activeOpacity={0.7}
              >
                <Text style={styles.drawerCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawerConfirmBtn, togglePwdVerifying && styles.drawerConfirmBtnDisabled]}
                onPress={handleConfirmTogglePwd}
                disabled={togglePwdVerifying}
                activeOpacity={0.7}
              >
                {togglePwdVerifying ? (
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
  container: { flex: 1, backgroundColor: "#F5F6F8", padding: 16 },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  infoLabel: { fontSize: 14, color: "#6B7280" },
  infoValue: { fontSize: 14, color: "#1F2937", fontWeight: "500" },
  infoRightWithIcon: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowIcon: { padding: 4 },
  infoDivider: { height: 1, backgroundColor: "#F3F4F6" },
  cardHint: { fontSize: 12, color: "#9CA3AF", marginTop: 10, lineHeight: 18 },
  // ── 设备管理 ──
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#374151", marginBottom: 12 },
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
  deviceRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
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
  deviceMeta: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  deviceDataPanel: {
    backgroundColor: "#F9FAFB", borderRadius: 8, padding: 12, marginTop: 4, marginBottom: 8,
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
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center", paddingVertical: 12 },
  loadMoreBtn: { paddingVertical: 10, alignItems: "center" },
  loadMoreBtnText: { fontSize: 13, color: "#287220", fontWeight: "500" },
  // Toast
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
  // Modal (费率编辑)
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1F2937", textAlign: "center", marginBottom: 8 },
  modalDesc: { fontSize: 13, color: "#9CA3AF", textAlign: "center", marginBottom: 16 },
  modalPwdLabel: { fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 6 },
  modalInput: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, padding: 14, fontSize: 16, color: "#1F2937", marginBottom: 12 },
  modalInputError: { borderColor: "#EF4444" },
  errorText: { fontSize: 12, color: "#EF4444", marginBottom: 12 },
  modalActions: { flexDirection: "row", gap: 12 },
  modalCancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center" },
  modalCancelText: { color: "#6B7280", fontWeight: "600" },
  modalConfirmBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: "#287220", alignItems: "center" },
  modalConfirmBtnDisabled: { backgroundColor: "#A5D6A7" },
  modalConfirmText: { color: "#FFFFFF", fontWeight: "600" },
  // Drawer (交易限制密码)
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
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20,
  },
  drawerTitle: { fontSize: 17, fontWeight: "600", color: "#1F2937", marginBottom: 8 },
  drawerDesc: { fontSize: 13, color: "#9CA3AF", marginBottom: 16 },
  pwdInput: {
    borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: "#1F2937",
  },
  pwdError: { fontSize: 13, color: "#EF4444", marginTop: 8 },
  drawerActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  drawerCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: "#F3F4F6", alignItems: "center",
  },
  drawerCancelText: { color: "#6B7280", fontWeight: "600", fontSize: 15 },
  drawerConfirmBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: "#287220", alignItems: "center",
  },
  drawerConfirmBtnDisabled: { opacity: 0.6 },
  drawerConfirmText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
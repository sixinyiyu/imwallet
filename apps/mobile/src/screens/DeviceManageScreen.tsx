import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { adminService, type WalletAdminInfo, type WalletTransaction, type WalletRecharge } from "../services/adminService";
import { ChevronRightIcon } from "../components/icons";
import EmptyState from "../components/EmptyState";
import { formatTime } from "../utils/date";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../types/navigation";

type DeviceManageRoute = RouteProp<RootStackParamList, "DeviceManage">;

/** 交易状态图标 */
function statusIcon(status: string): string {
  if (status === "confirmed" || status === "success") return "✅";
  if (status === "pending" || status === "processing") return "⏳";
  if (status === "failed" || status === "rejected") return "❌";
  return "✅";
}

export default function DeviceManageScreen() {
  const route = useRoute<DeviceManageRoute>();
  const adminPwd = route.params.password;

  const [wallets, setWallets] = useState<WalletAdminInfo[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [recharges, setRecharges] = useState<WalletRecharge[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataTab, setDataTab] = useState<"transactions" | "recharges">("transactions");
  const [dataOffset, setDataOffset] = useState(0);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  // 自动加载钱包列表
  useEffect(() => {
    const load = async () => {
      setWalletsLoading(true);
      try {
        const list = await adminService.listWallets(adminPwd);
        setWallets(list);
      } catch {
        showToast("加载钱包列表失败");
      }
      setWalletsLoading(false);
    };
    load();
  }, [adminPwd]);

  const handleSelectWallet = async (walletId: string) => {
    if (selectedWallet === walletId) {
      setSelectedWallet(null);
      return;
    }
    setSelectedWallet(walletId);
    setDataOffset(0);
    setDataTab("transactions");
    setDataLoading(true);
    try {
      const [txns, rechs] = await Promise.all([
        adminService.getWalletTransactions(walletId, adminPwd, 0),
        adminService.getWalletRecharges(walletId, adminPwd, 0),
      ]);
      setTransactions(txns);
      setRecharges(rechs);
    } catch {
      showToast("加载钱包数据失败");
    }
    setDataLoading(false);
  };

  const handleLoadMore = async () => {
    if (!selectedWallet) return;
    const nextOffset = dataOffset + 20;
    setDataOffset(nextOffset);
    setDataLoading(true);
    try {
      if (dataTab === "transactions") {
        const more = await adminService.getWalletTransactions(selectedWallet, adminPwd, nextOffset);
        setTransactions((prev) => [...prev, ...more]);
      } else {
        const more = await adminService.getWalletRecharges(selectedWallet, adminPwd, nextOffset);
        setRecharges((prev) => [...prev, ...more]);
      }
    } catch {
      showToast("加载更多失败");
    }
    setDataLoading(false);
  };

  if (walletsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#287220" />
      </View>
    );
  }

  if (wallets.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState message="暂无钱包数据" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={wallets}
        keyExtractor={(w) => w.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: w }) => (
          <View style={styles.walletCard}>
            {/* 钱包头部 */}
            <TouchableOpacity
              style={styles.walletHeader}
              onPress={() => handleSelectWallet(w.id)}
              activeOpacity={0.7}
            >
              <View style={styles.walletInfo}>
                <Text style={styles.walletAlias}>{w.alias}</Text>
                <Text style={styles.walletMeta}>
                  {w.chains.length > 0 ? w.chains.join(" · ") : "无链"} · {w.deviceCount} 个设备关联
                </Text>
              </View>
              <ChevronRightIcon
                size={16}
                color="#8899B8"
              />
            </TouchableOpacity>

            {/* 展开区域 */}
            {selectedWallet === w.id && (
              <View style={styles.expandPanel}>
                {/* 关联设备 */}
                {w.devices.length > 0 && (
                  <View style={styles.deviceSection}>
                    <Text style={styles.sectionLabel}>关联设备</Text>
                    {w.devices.map((d) => (
                      <View key={d.id} style={styles.deviceRow}>
                        <Text style={styles.deviceId}>{d.id.slice(0, 8)}...{d.id.slice(-6)}</Text>
                        <Text style={styles.devicePlatform}>{d.platform}</Text>
                        <View style={[styles.onlineDot, d.online ? styles.onlineDotOn : styles.onlineDotOff]} />
                        <Text style={[styles.onlineText, d.online ? styles.onlineTextOn : styles.onlineTextOff]}>
                          {d.online ? "在线" : "离线"}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* 数据加载 */}
                {dataLoading ? (
                  <ActivityIndicator size="small" color="#287220" style={{ marginVertical: 16 }} />
                ) : (
                  <>
                    {/* Tab 切换 */}
                    <View style={styles.tabRow}>
                      <TouchableOpacity
                        style={[styles.tab, dataTab === "transactions" && styles.tabActive]}
                        onPress={() => setDataTab("transactions")}
                      >
                        <Text style={[styles.tabText, dataTab === "transactions" && styles.tabTextActive]}>交易</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.tab, dataTab === "recharges" && styles.tabActive]}
                        onPress={() => setDataTab("recharges")}
                      >
                        <Text style={[styles.tabText, dataTab === "recharges" && styles.tabTextActive]}>充值</Text>
                      </TouchableOpacity>
                    </View>

                    {/* 交易列表 */}
                    {dataTab === "transactions" ? (
                      transactions.length === 0 ? (
                        <EmptyState message="暂无交易记录" />
                      ) : (
                        transactions.map((t) => (
                          <View key={t.id} style={styles.txCard}>
                            <View style={styles.txTopRow}>
                              <View style={styles.txLabelWrap}>
                                <Text style={styles.txStatusIcon}>{statusIcon(t.status)}</Text>
                                <Text style={styles.txLabel}>{t.status === "confirmed" ? "转账" : t.status}</Text>
                              </View>
                              <Text style={styles.txAmount}>{t.amount} {t.tokenSymbol}</Text>
                            </View>
                            <View style={styles.txMiddleRow}>
                              <Text style={styles.txAddr} numberOfLines={1}>
                                {t.fromAddress.slice(0, 8)}...→{t.toAddress.slice(0, 8)}...
                              </Text>
                            </View>
                            <View style={styles.txBottomRow}>
                              <Text style={styles.txTime}>{formatTime(t.createdAt)}</Text>
                              {parseFloat(t.fee) > 0 && (
                                <Text style={styles.txFee}>手续费 {t.fee}</Text>
                              )}
                            </View>
                          </View>
                        ))
                      )
                    ) : (
                      recharges.length === 0 ? (
                        <EmptyState message="暂无充值记录" />
                      ) : (
                        recharges.map((r) => (
                          <View key={r.id} style={styles.txCard}>
                            <View style={styles.txTopRow}>
                              <View style={styles.txLabelWrap}>
                                <Text style={styles.txStatusIcon}>💰</Text>
                                <Text style={styles.txLabel}>充值</Text>
                              </View>
                              <Text style={[styles.txAmount, { color: "#10B981" }]}>+{r.amount} {r.tokenSymbol}</Text>
                            </View>
                            <View style={styles.txMiddleRow}>
                              <Text style={styles.txAddr} numberOfLines={1}>
                                {r.walletAlias} · {r.accountAddress.slice(0, 8)}...
                              </Text>
                            </View>
                            <View style={styles.txBottomRow}>
                              <Text style={styles.txTime}>{formatTime(r.createdAt)}</Text>
                            </View>
                          </View>
                        ))
                      )
                    )}

                    {/* 加载更多（仅在有记录时显示） */}
                    {(dataTab === "transactions" ? transactions.length : recharges.length) > 0 && (
                      <TouchableOpacity
                        style={styles.loadMoreBtn}
                        onPress={handleLoadMore}
                        disabled={dataLoading}
                        activeOpacity={0.7}
                      >
                        {dataLoading ? (
                          <ActivityIndicator size="small" color="#287220" />
                        ) : (
                          <Text style={styles.loadMoreBtnText}>加载更多</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        )}
      />

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
  loadingContainer: { flex: 1, backgroundColor: "#F5F6F8", justifyContent: "center", alignItems: "center" },
  emptyContainer: { flex: 1, backgroundColor: "#F5F6F8", justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16 },

  // ── 钱包卡片 ──
  walletCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  walletHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  walletInfo: { flex: 1 },
  walletAlias: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  walletMeta: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },

  // ── 展开面板 ──
  expandPanel: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },

  // ── 关联设备 ──
  deviceSection: { marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontWeight: "500", color: "#6B7280", marginBottom: 8 },
  deviceRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 6,
  },
  deviceId: { fontSize: 12, color: "#6B7280", fontFamily: "monospace" },
  devicePlatform: { fontSize: 12, color: "#9CA3AF" },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineDotOn: { backgroundColor: "#10B981" },
  onlineDotOff: { backgroundColor: "#D1D5DB" },
  onlineText: { fontSize: 12, fontWeight: "500" },
  onlineTextOn: { color: "#10B981" },
  onlineTextOff: { color: "#9CA3AF" },

  // ── Tab ──
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tab: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6, backgroundColor: "#F3F4F6" },
  tabActive: { backgroundColor: "#287220" },
  tabText: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  tabTextActive: { color: "#FFFFFF" },

  // ── 交易/充值卡片 ──
  txCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  txTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  txLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  txStatusIcon: { fontSize: 14 },
  txLabel: { fontSize: 14, fontWeight: "500", color: "#1F2937" },
  txAmount: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  txMiddleRow: { marginTop: 6 },
  txAddr: { fontSize: 12, color: "#6B7280", fontFamily: "monospace" },
  txBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  txTime: { fontSize: 12, color: "#9CA3AF" },
  txFee: { fontSize: 12, color: "#9CA3AF" },

  // ── 加载更多 ──
  loadMoreBtn: { paddingVertical: 10, alignItems: "center" },
  loadMoreBtnText: { fontSize: 13, color: "#287220", fontWeight: "500" },

  // ── Toast ──
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
});

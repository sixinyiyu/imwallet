import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { adminService, type WalletAdminInfo, type WalletTransaction, type WalletRecharge } from "../services/adminService";
import { ChevronRightIcon, AndroidIcon, IosIcon, WalletIcon, TOKEN_ICONS, renderTokenIcon } from "../components/icons";
import { WalletListSkeleton } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { formatTime } from "../utils/date";
import { getPlaintextPassword, clearAdminAuthCache } from "../utils/adminAuthCache";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../types/navigation";

type DeviceManageRoute = RouteProp<RootStackParamList, "DeviceManage">;


/** 平台图标 */
function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  if (platform === "ios") return <IosIcon size={size} color="#555" />;
  return <AndroidIcon size={size} color="#A4C639" />;
}

export default function DeviceManageScreen() {
  const route = useRoute<DeviceManageRoute>();
  // 从缓存获取明文密码（验证成功后已缓存），不再从路由参数获取
  const adminPwd = getPlaintextPassword();

  // adminPwd 为 null 时显示空页面（等待返回上一页）
  if (!adminPwd) {
    return <View style={styles.container} />;
  }

  const [wallets, setWallets] = useState<WalletAdminInfo[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [walletsPage, setWalletsPage] = useState(1);
  const [walletsTotal, setWalletsTotal] = useState(0);
  const [walletsLoadingMore, setWalletsLoadingMore] = useState(false);

  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [recharges, setRecharges] = useState<WalletRecharge[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataTab, setDataTab] = useState<"transactions" | "recharges">("transactions");
  const [dataOffset, setDataOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  // 缓存过期守卫：密码缓存失效时提示并返回上一页
  const navigation = useNavigation();
  useEffect(() => {
    if (!adminPwd) {
      showToast("管理密码缓存已过期，请重新验证");
      clearAdminAuthCache();
      setTimeout(() => navigation.goBack(), 1500);
    }
  }, [adminPwd]);

  const loadWallets = useCallback(async (page: number, append = false) => {
    try {
      const list = await adminService.listWallets(adminPwd);
      setWalletsTotal(list.length);
      setWallets((prev) => (append ? [...prev, ...list] : list));
      setWalletsPage(page);
    } catch (err: any) {
      const msg = err?.message || "加载钱包列表失败";
      if (__DEV__) console.warn("[DeviceManage] loadWallets error:", msg);
      showToast(msg);
    }
  }, [adminPwd]);

  useEffect(() => {
    setWalletsLoading(true);
    loadWallets(1).finally(() => setWalletsLoading(false));
  }, [adminPwd]);

  const handleWalletsLoadMore = async () => {
    if (wallets.length >= walletsTotal || walletsLoadingMore) return;
    setWalletsLoadingMore(true);
    await loadWallets(walletsPage + 1, true);
    setWalletsLoadingMore(false);
  };

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
    } catch (err: any) {
      const msg = err?.message || "加载钱包数据失败";
      if (__DEV__) console.warn("[DeviceManage] loadWalletData error:", msg);
      showToast(msg);
    }
    setDataLoading(false);
  };

  const handleLoadMore = async () => {
    if (!selectedWallet || loadingMore) return;
    const nextOffset = dataOffset + 20;
    setDataOffset(nextOffset);
    setLoadingMore(true);
    try {
      if (dataTab === "transactions") {
        const more = await adminService.getWalletTransactions(selectedWallet, adminPwd, nextOffset);
        setTransactions((prev) => [...prev, ...more]);
      } else {
        const more = await adminService.getWalletRecharges(selectedWallet, adminPwd, nextOffset);
        setRecharges((prev) => [...prev, ...more]);
      }
    } catch (err: any) {
      const msg = err?.message || "加载更多失败";
      if (__DEV__) console.warn("[DeviceManage] loadMore error:", msg);
      showToast(msg);
    }
    setLoadingMore(false);
  };

  if (walletsLoading) {
    return (
      <View style={styles.container}>
        <WalletListSkeleton count={4} />
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
              <View style={styles.walletIconContainer}>
                <WalletIcon size={24} color="#287220" />
              </View>
              <View style={styles.walletInfo}>
                <Text style={styles.walletAlias}>{w.alias}</Text>
                <Text style={styles.walletMeta}>
                  {w.chains.length > 0 ? w.chains.join(" · ") : "无链"} · {w.deviceCount} 个设备关联
                </Text>
              </View>
              <View style={[styles.chevronWrap, selectedWallet === w.id && styles.chevronExpanded]}>
                <ChevronRightIcon size={18} color="#8899B8" />
              </View>
            </TouchableOpacity>

            {/* 关联设备 — 默认显示，不折叠 */}
            {w.devices.length > 0 && (
              <View style={styles.deviceSection}>
                <Text style={styles.sectionLabel}>关联设备</Text>
                {w.devices.map((d) => (
                  <View key={d.id} style={styles.deviceRow}>
                    <Text style={styles.deviceId}>{d.id.slice(0, 24)}...{d.id.slice(-18)}</Text>
                    <View style={styles.deviceRight}>
                      <PlatformIcon platform={d.platform} size={16} />
                      <View style={[styles.onlineDot, d.online ? styles.onlineDotOn : styles.onlineDotOff]} />
                      <Text style={[styles.onlineText, d.online ? styles.onlineTextOn : styles.onlineTextOff]}>
                        {d.online ? "在线" : "离线"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* 展开区域 — 仅交易/充值 */}
            {selectedWallet === w.id && (
              <View style={styles.expandPanel}>
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

                    {dataTab === "transactions" ? (
                      transactions.length === 0 ? (
                        <EmptyState message="暂无交易记录" />
                      ) : (
                        transactions.map((t) => (
                          <View key={t.id} style={styles.txCard}>
                            <View style={styles.txTopRow}>
                              <View style={styles.txTokenWrap}>
                                {TOKEN_ICONS[t.tokenSymbol]
                                  ? React.createElement(TOKEN_ICONS[t.tokenSymbol], { size: 20 })
                                  : <Text style={styles.txTokenEmoji}>🪙</Text>
                                }
                                <Text style={styles.txSymbol}>{t.tokenSymbol}</Text>
                              </View>
                              <Text style={styles.txAmount}>{t.amount} / 手续费 {t.fee}</Text>
                            </View>
                            <View style={styles.txAddrRow}>
                              <Text style={styles.txAddr} numberOfLines={1} ellipsizeMode="middle">
                                {t.fromAddress}
                              </Text>
                              <Text style={styles.txArrow}> → </Text>
                              <Text style={styles.txAddr} numberOfLines={1} ellipsizeMode="middle">
                                {t.toAddress}
                              </Text>
                            </View>
                            <View style={styles.txBottomRow}>
                              <Text style={styles.txTime}>{formatTime(t.createdAt)}</Text>
                              <Text style={styles.txPlatform}>{t.platform === "ios" ? "iOS" : "Android"}</Text>
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
                              <View style={styles.txTokenWrap}>
                                {TOKEN_ICONS[r.tokenSymbol]
                                  ? React.createElement(TOKEN_ICONS[r.tokenSymbol], { size: 20 })
                                  : <Text style={styles.txTokenEmoji}>🪙</Text>
                                }
                                <Text style={styles.txSymbol}>{r.tokenSymbol}</Text>
                              </View>
                              <Text style={[styles.txAmount, { color: "#10B981" }]}>+{r.amount}</Text>
                            </View>
                            <View style={styles.txAddrRow}>
                              <Text style={styles.txAddrLabel}>{r.walletAlias}</Text>
                              <Text style={styles.txAddr} numberOfLines={1} ellipsizeMode="middle">
                                {r.accountAddress}
                              </Text>
                            </View>
                            <View style={styles.txBottomRow}>
                              <Text style={styles.txTime}>{formatTime(r.createdAt)}</Text>
                            </View>
                          </View>
                        ))
                      )
                    )}

                    {(dataTab === "transactions" ? transactions.length : recharges.length) > 0 && (() => {
                      const items = dataTab === "transactions" ? transactions : recharges;
                      const hasMore = items.length >= 20;
                      return hasMore ? (
                        <TouchableOpacity
                          style={styles.loadMoreBtn}
                          onPress={handleLoadMore}
                          disabled={loadingMore}
                          activeOpacity={0.7}
                        >
                          {loadingMore ? (
                            <ActivityIndicator size="small" color="#287220" />
                          ) : (
                            <Text style={styles.loadMoreBtnText}>加载更多</Text>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.endHint}>— 已加载全部 —</Text>
                      );
                    })()}
                  </>
                )}
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={<EmptyState message="暂无钱包数据" />}
        ListFooterComponent={
          walletsLoadingMore ? (
            <ActivityIndicator style={{ padding: 20 }} color="#9CA3AF" />
          ) : wallets.length > 0 && wallets.length >= walletsTotal ? (
            <Text style={styles.endHint}>— 已加载全部 —</Text>
          ) : null
        }
        onEndReached={handleWalletsLoadMore}
        onEndReachedThreshold={0.3}
      />

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
  listContent: { padding: 16, paddingBottom: 20 },
  endHint: { textAlign: "center", paddingVertical: 20, fontSize: 13, color: "#D1D5DB" },

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
    flexDirection: "row", alignItems: "center",
  },
  walletIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  walletInfo: { flex: 1 },
  chevronWrap: {
    transform: [{ rotate: "0deg" }],
  },
  chevronExpanded: {
    transform: [{ rotate: "90deg" }],
  },
  walletAlias: { fontSize: 16, fontWeight: "600", color: "1F2937" },
  walletMeta: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },

  // ── 关联设备（默认显示） ──
  deviceSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 8,
  },
  sectionLabel: { fontSize: 13, fontWeight: "500", color: "#6B7280", marginBottom: 6 },
  deviceRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 6,
  },
  deviceId: { fontSize: 12, color: "#6B7280", fontFamily: "monospace", flex: 1 },
  deviceRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineDotOn: { backgroundColor: "#10B981" },
  onlineDotOff: { backgroundColor: "#D1D5DB" },
  onlineText: { fontSize: 12, fontWeight: "500" },
  onlineTextOn: { color: "#10B981" },
  onlineTextOff: { color: "#9CA3AF" },

  // ── 展开面板（仅交易/充值） ──
  expandPanel: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },

  // ── Tab ──
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tab: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6, backgroundColor: "#F3F4F6" },
  tabActive: { backgroundColor: "#287220" },
  tabText: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  tabTextActive: { color: "#FFFFFF" },

  // ── 交易/充值卡片 ──
  txCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  txTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  txTokenWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  txTokenEmoji: { fontSize: 16 },
  txSymbol: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  txAmount: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  txAddrRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  txAddr: { fontSize: 13, color: "#6B7280", fontFamily: "monospace", flex: 1 },
  txAddrLabel: { fontSize: 13, fontWeight: "500", color: "#374151", marginRight: 6 },
  txArrow: { fontSize: 13, color: "#9CA3AF", fontWeight: "500" },
  txBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  txTime: { fontSize: 12, color: "#9CA3AF" },
  txPlatform: {
    fontSize: 11,
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },

  // ── 加载更多 ──
  loadMoreBtn: { paddingVertical: 10, alignItems: "center" },
  loadMoreBtnText: { fontSize: 13, color: "#287220", fontWeight: "500" },

  // ── Toast ──
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
});
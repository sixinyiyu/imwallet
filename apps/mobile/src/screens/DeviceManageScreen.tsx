import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { adminService, type WalletAdminInfo, type WalletTransaction } from "../services/adminService";
import { rechargeService, type RechargeRecord } from "../services/rechargeService";
import { walletService } from "../services/walletService";
import type { SimpleWallet } from "../types";
import { configService, type FeeConfig } from "../services/configService";
import { ChevronRightIcon, AndroidIcon, IosIcon, WalletIcon, PlusCircleIcon, TOKEN_ICONS, renderTokenIcon } from "../components/icons";
import { WalletListSkeleton } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { formatTime } from "../utils/date";
import { getPlaintextPassword, clearAdminAuthCache } from "../utils/adminAuthCache";
import { useWalletStore } from "../stores/walletStore";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../types/navigation";

/** 格式化 CNY 金额：保留2位小数 */
function formatCny(value: string): string {
  const num = parseFloat(value) || 0;
  return num.toFixed(2);
}

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
  // 从配置管理页传递的充值权限标志，无需重新判断
  const rechargePermitted = route.params?.rechargePermitted ?? false;

  const [wallets, setWallets] = useState<WalletAdminInfo[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [walletsPage, setWalletsPage] = useState(1);
  const [walletsTotal, setWalletsTotal] = useState(0);
  const [walletsLoadingMore, setWalletsLoadingMore] = useState(false);

  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  // 当前选中钱包的链上地址（用于判断交易角色：发送方 vs 接收方）
  const [walletAddresses, setWalletAddresses] = useState<string[]>([]);
  // 手续费配置（用于计算实到金额）
  const [feeConfig, setFeeConfig] = useState<FeeConfig>({ feeRate: 0.005, feeMode: "DEDUCTED" });
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [recharges, setRecharges] = useState<RechargeRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataTab, setDataTab] = useState<"transactions" | "recharges">("transactions");
  const [dataPage, setDataPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // 订阅钱包相关状态
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [subscribeWallets, setSubscribeWallets] = useState<SimpleWallet[]>([]);
  const [subscribeLoading, setSubscribeLoading] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

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

  // adminPwd 为 null 时显示空页面（等待返回上一页）
  if (!adminPwd) {
    return <View style={styles.container} />;
  }

  const loadWallets = useCallback(async (page: number, append = false) => {
    try {
      const res = await adminService.listWallets(adminPwd, page, 10);
      setWalletsTotal(res.total);
      setWallets((prev) => (append ? [...prev, ...res.wallets] : res.wallets));
      setWalletsPage(res.page);
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
    setWalletAddresses([]);
    setTransactions([]);
    setRecharges([]);
    return;    }
    setSelectedWallet(walletId);
    setDataPage(1);
    setDataTab("transactions");
    setDataLoading(true);
    try {
      // 同时获取钱包地址（判断交易角色）和手续费配置
      const fetches: Promise<any>[] = [
        adminService.getWalletTransactions(walletId, adminPwd, 1, 20),
        walletService.getWalletAddresses(walletId).catch(() => ({ addresses: [] })),
        configService.getFeeConfig().catch(() => null),
      ];
      // 仅充值权限设备才加载充值数据（使用白名单接口，无需管理密码）
      if (rechargePermitted) {
        fetches.push(rechargeService.getMyRechargeRecords(1, 20, walletId));
      }
      const results = await Promise.all(fetches);
      setTransactions(results[0].transactions);
      setWalletAddresses(results[1].addresses.map((a: any) => a.address));
      if (results[2]) setFeeConfig(results[2]);
      if (rechargePermitted && results[3]) {
        setRecharges(results[3].recharges);
      } else {
        setRecharges([]);
      }
    } catch (err: any) {
      const msg = err?.message || "加载钱包数据失败";
      if (__DEV__) console.warn("[DeviceManage] loadWalletData error:", msg);
      showToast(msg);
    }
    setDataLoading(false);
  };

  const handleLoadMore = async () => {
    if (!selectedWallet || loadingMore) return;
    const nextPage = dataPage + 1;
    setDataPage(nextPage);
    setLoadingMore(true);
    try {
      if (dataTab === "transactions") {
        const more = await adminService.getWalletTransactions(selectedWallet, adminPwd, nextPage, 20);
        setTransactions((prev) => [...prev, ...more.transactions]);
      } else {
        const more = await rechargeService.getMyRechargeRecords(nextPage, 20, selectedWallet);
        setRecharges((prev) => [...prev, ...more.recharges]);
      }
    } catch (err: any) {
      const msg = err?.message || "加载更多失败";
      if (__DEV__) console.warn("[DeviceManage] loadMore error:", msg);
      showToast(msg);
    }
    setLoadingMore(false);
  };

  // ── 订阅钱包 ──

  const handleOpenSubscribe = async () => {
    setSubscribeLoading(true);
    setSubscribeError(null);
    try {
      // 加载所有系统钱包
      const { wallets: allWallets } = await walletService.getAllWallets({ limit: 100 });
      // 获取当前设备已订阅的钱包 ID
      const currentWalletIds = new Set(useWalletStore.getState().wallets.map((w) => w.id));
      // 过滤掉已订阅的
      const available = allWallets.filter((w) => !currentWalletIds.has(w.id));
      setSubscribeWallets(available);
      setShowSubscribeModal(true);
    } catch (err: any) {
      showToast(err?.message || "加载钱包列表失败");
    }
    setSubscribeLoading(false);
  };

  const handleSubscribeWallet = async (walletId: string) => {
    setSubscribing(true);
    setSubscribeError(null);
    try {
      await useWalletStore.getState().subscribeWallet(walletId);
      showToast("订阅成功");
      setShowSubscribeModal(false);
      // 刷新钱包列表（移除已订阅的）
      const currentWalletIds = new Set(useWalletStore.getState().wallets.map((w) => w.id));
      setSubscribeWallets((prev) => prev.filter((w) => !currentWalletIds.has(w.id)));
    } catch (err: any) {
      setSubscribeError(err?.message || "订阅失败，请重试");
    }
    setSubscribing(false);
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
      {/* 订阅钱包按钮 */}
      <TouchableOpacity
        style={styles.subscribeBtn}
        onPress={handleOpenSubscribe}
        disabled={subscribeLoading}
        activeOpacity={0.7}
      >
        {subscribeLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <View style={styles.subscribeBtnContent}>
            <PlusCircleIcon size={18} color="#fff" />
            <Text style={styles.subscribeBtnText}>订阅钱包</Text>
          </View>
        )}
      </TouchableOpacity>

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
                <View style={styles.walletNameRow}>
                  <Text style={styles.walletAlias}>{w.alias}</Text>
                  <Text style={styles.walletBalanceValue}>¥{formatCny(w.totalBalanceCny)}</Text>
                </View>
                <Text style={styles.walletIdentifier} selectable>{w.id}</Text>
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

            {/* 代币余额 — 默认显示，不折叠 */}
            {w.assets.length > 0 && (
              <View style={styles.assetSection}>
                <Text style={styles.sectionLabel}>代币余额</Text>
                {w.assets.map((a) => (
                  <View key={a.assetId} style={styles.assetRow}>
                    <View style={styles.assetIconWrap}>
                      {renderTokenIcon(a.symbol, 20)}
                    </View>
                    <View style={styles.assetInfo}>
                      <Text style={styles.assetSymbol}>{a.symbol}</Text>
                      <Text style={styles.assetChain}>{a.chain}</Text>
                    </View>
                    <View style={styles.assetAmountWrap}>
                      <Text style={styles.assetBalance}>{a.balance}</Text>
                      <Text style={styles.assetCny}>≈ ¥{formatCny(a.cnyValue)}</Text>
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
                    {/* Tab 切换 — 仅充值权限设备显示充值tab */}
                    {rechargePermitted ? (
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
                    ) : null}

                    {dataTab === "transactions" ? (
                      transactions.length === 0 ? (
                        <EmptyState message="暂无交易记录" />
                      ) : (
                        transactions.map((t) => {
                          // 判断交易角色：发送方 vs 接收方
                          const isReceive = walletAddresses.includes(t.toAddress);
                          const isSend = walletAddresses.includes(t.fromAddress);
                          const feeNum = parseFloat(t.fee) || 0;
                          const amountNum = parseFloat(t.amount) || 0;
                          // 计算实到金额
                          const receivedNum = feeConfig.feeMode === "EXTRA" ? amountNum : amountNum - feeNum;
                          const directionLabel = isReceive ? "收到" : "发送";
                          const directionColor = isReceive ? "#10B981" : "#EF4444";
                          // 接收方看到实到金额，发送方看到转账金额
                          const displayAmount = isReceive ? receivedNum : amountNum;
                          const prefix = isReceive ? "+" : "-";
                          return (
                          <View key={t.id} style={styles.txCard}>
                            <View style={styles.txTopRow}>
                              <View style={styles.txTokenWrap}>
                                {TOKEN_ICONS[t.tokenSymbol]
                                  ? React.createElement(TOKEN_ICONS[t.tokenSymbol], { size: 20 })
                                  : <Text style={styles.txTokenEmoji}>🪙</Text>
                                }
                                <Text style={styles.txSymbol}>{t.tokenSymbol}</Text>
                                <Text style={[styles.txDirection, { color: directionColor }]}>{directionLabel}</Text>
                              </View>
                              <Text style={[styles.txAmount, { color: directionColor }]}>
                                {prefix}{displayAmount.toFixed(6)}
                              </Text>
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
                              <View style={styles.txBottomLeft}>
                                <PlatformIcon platform={t.platform} size={14} />
                                <Text style={styles.txTime}>{formatTime(t.createdAt)}</Text>
                              </View>
                              {/* 发送方显示手续费+实到，接收方不显示手续费 */}
                              {isSend && feeNum > 0 && (
                                <Text style={styles.txFee}>手续费 {feeNum.toFixed(6)} · 实到 {receivedNum.toFixed(6)}</Text>
                              )}
                            </View>
                          </View>
                          );
                        })
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

      {/* 订阅钱包 Modal */}
      <Modal
        visible={showSubscribeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSubscribeModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.drawerOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <Pressable style={styles.drawerBackdrop} onPress={() => setShowSubscribeModal(false)} />
            <View style={styles.drawerContent}>
              <View style={styles.drawerHandle} />
              <Text style={styles.drawerTitle}>订阅钱包</Text>
              <Text style={styles.drawerDesc}>选择一个钱包订阅到当前设备（只读，无法转账或添加账户）</Text>
              {subscribeError && <Text style={styles.subscribeError}>{subscribeError}</Text>}
              {subscribeWallets.length === 0 ? (
                <View style={styles.subscribeEmpty}>
                  <Text style={styles.subscribeEmptyText}>所有钱包均已订阅</Text>
                </View>
              ) : (
                subscribeWallets.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={styles.subscribeWalletRow}
                    onPress={() => handleSubscribeWallet(w.id)}
                    disabled={subscribing}
                    activeOpacity={0.7}
                  >
                    <View style={styles.subscribeWalletIconWrap}>
                      <WalletIcon size={20} color="#287220" />
                    </View>
                    <View style={styles.subscribeWalletInfo}>
                      <Text style={styles.subscribeWalletName}>{w.name}</Text>
                      <Text style={styles.subscribeWalletId} selectable>{w.id}</Text>
                    </View>
                    {subscribing ? (
                      <ActivityIndicator size="small" color="#287220" />
                    ) : (
                      <ChevronRightIcon size={16} color="#8899B8" />
                    )}
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity
                style={styles.drawerCancelBtn}
                onPress={() => setShowSubscribeModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.drawerCancelText}>关闭</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
  walletNameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  walletBalanceValue: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  walletIdentifier: { fontSize: 12, color: "#9CA3AF", fontFamily: "monospace", marginTop: 2 },
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

  // ── 代币余额区域 ──
  assetSection: {
    marginBottom: 12,
  },
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  assetIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  assetInfo: { flex: 1 },
  assetSymbol: { fontSize: 14, fontWeight: "500", color: "#1F2937" },
  assetChain: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
  assetAmountWrap: { alignItems: "flex-end" },
  assetBalance: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  assetCny: { fontSize: 11, color: "#9CA3AF", marginTop: 1 },

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
  txDirection: { fontSize: 13, fontWeight: "500", marginLeft: 6 },
  txFee: { fontSize: 12, color: "#9CA3AF" },
  txAddrRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  txAddr: { fontSize: 13, color: "#6B7280", fontFamily: "monospace", flex: 1 },
  txAddrLabel: { fontSize: 13, fontWeight: "500", color: "#374151", marginRight: 6 },
  txArrow: { fontSize: 13, color: "#9CA3AF", fontWeight: "500" },
  txBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  txBottomLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
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

  // ── 订阅钱包按钮 ──
  subscribeBtn: {
    backgroundColor: "#287220",
    borderRadius: 10,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    alignItems: "center",
  },
  subscribeBtnContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  subscribeBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  // ── 订阅钱包 Modal ──
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
  drawerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20 },
  drawerTitle: { fontSize: 17, fontWeight: "600", color: "#1F2937", marginBottom: 8 },
  drawerDesc: { fontSize: 13, color: "#9CA3AF", marginBottom: 16 },
  subscribeError: { fontSize: 13, color: "#EF4444", marginBottom: 12 },
  subscribeEmpty: { paddingVertical: 32, alignItems: "center" },
  subscribeEmptyText: { fontSize: 14, color: "#9CA3AF" },
  subscribeWalletRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
  },
  subscribeWalletIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center",
    marginRight: 12,
  },
  subscribeWalletInfo: { flex: 1 },
  subscribeWalletName: { fontSize: 15, fontWeight: "500", color: "#1F2937" },
  subscribeWalletId: { fontSize: 11, color: "#9CA3AF", fontFamily: "monospace", marginTop: 2 },
  drawerCancelBtn: {
    marginTop: 16, paddingVertical: 14, borderRadius: 10,
    backgroundColor: "#F3F4F6", alignItems: "center",
  },
  drawerCancelText: { color: "#6B7280", fontWeight: "600", fontSize: 15 },
});
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
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
import { adminService, type WalletAdminInfo, type WalletTransaction, type WalletRecharge } from "../services/adminService";
import { walletService } from "../services/walletService";
import type { SimpleWallet } from "../types";
import { configService, type FeeConfig } from "../services/configService";
import { ChevronRightIcon, AndroidIcon, IosIcon, WalletIcon, TOKEN_ICONS, renderTokenIcon, SubscribeIcon } from "../components/icons";
import { WalletListSkeleton } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { formatTime } from "../utils/date";
import { getPlaintextPassword, clearAdminAuthCache } from "../utils/adminAuthCache";
import { useWalletStore } from "../stores/walletStore";
import { formatCny, getErrorMessage, trimAmount } from "../utils/format";
// saveLogToLocal removed — not a core interface
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
  const navigation = useNavigation();
  const adminPwd = getPlaintextPassword();
  const rechargePermitted = route.params?.rechargePermitted ?? false;

  const [wallets, setWallets] = useState<WalletAdminInfo[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [walletsPage, setWalletsPage] = useState(1);
  const [walletsTotal, setWalletsTotal] = useState(0);
  const [walletsLoadingMore, setWalletsLoadingMore] = useState(false);

  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [walletAddresses, setWalletAddresses] = useState<string[]>([]);
  const [feeConfig, setFeeConfig] = useState<FeeConfig>({ feeRate: 0.005, feeMode: "DEDUCTED" });
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [recharges, setRecharges] = useState<WalletRecharge[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataTab, setDataTab] = useState<"transactions" | "recharges">("transactions");
  const [dataPage, setDataPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // 订阅钱包相关状态
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [subscribeWallets, setSubscribeWallets] = useState<SimpleWallet[]>([]);
  const [, setSubscribeLoading] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  // 当前设备的本地钱包信息（ID + source），用于卡片标签区分：本地 vs 已订阅 vs 未订阅
  // 用字符串做 selector，避免每次创建新对象导致无限重渲染
  const localWalletInfoStr = useWalletStore((s) => s.wallets.map((w) => `${w.id}:${w.source}`).sort().join(','));
  const localWalletSourceMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!localWalletInfoStr) return map;
    localWalletInfoStr.split(',').forEach((entry) => {
      const [id, source] = entry.split(':');
      if (id && source) map.set(id, source);
    });
    return map;
  }, [localWalletInfoStr]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  // 缓存过期守卫
  useEffect(() => {
    if (!adminPwd) {
      showToast("管理密码缓存已过期，请重新验证");
      clearAdminAuthCache();
      setTimeout(() => navigation.goBack(), 1500);
    }
  }, [adminPwd]);

  // 导航栏右侧订阅按钮 — 用 ref 持有回调，只 setOptions 一次，避免无限循环
  const openSubscribeRef = useRef<() => void>(() => {});

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => openSubscribeRef.current()}
          style={{ marginRight: 16, padding: 4 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <SubscribeIcon size={22} color="#287220" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  if (!adminPwd) {
    return <View style={styles.container} />;
  }

  const loadWallets = useCallback(async (page: number, append = false) => {
    try {
      const res = await adminService.listWallets(adminPwd, page, 10);
      setWalletsTotal(res.total);
      setWallets((prev) => (append ? [...prev, ...res.wallets] : res.wallets));
      setWalletsPage(res.page);
    } catch (err: unknown) {
      showToast(getErrorMessage(err, "加载钱包列表失败"));
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
      return;
    }
    setSelectedWallet(walletId);
    setDataPage(1);
    setDataTab("transactions");
    setDataLoading(true);
    try {
      const txPromise = adminService.getWalletTransactions(walletId, adminPwd, 1, 20);
      const addrPromise = walletService.getWalletAddresses(walletId).catch(() => {
        return { addresses: [] };
      });
      const feePromise = configService.getFeeConfig().catch(() => {
        return null;
      });
      const rechargePromise = rechargePermitted
        ? adminService.getRechargeRecords(adminPwd, 1, 20, walletId)
        : null;

      const [txResult, addrResult, feeResult, rechargeResult] = await Promise.all([
        txPromise, addrPromise, feePromise, rechargePromise ?? Promise.resolve(null),
      ]);
      setTransactions(txResult.transactions);
      setWalletAddresses(addrResult.addresses.map((a: { address: string }) => a.address));
      if (feeResult) setFeeConfig(feeResult);
      setRecharges(rechargeResult?.recharges ?? []);
    } catch (err: unknown) {
      showToast(getErrorMessage(err, "加载钱包数据失败"));
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
        const more = await adminService.getRechargeRecords(adminPwd, nextPage, 20, selectedWallet);
        setRecharges((prev) => [...prev, ...more.recharges]);
      }
    } catch (err: unknown) {
      showToast(getErrorMessage(err, "加载更多失败"));
    }
    setLoadingMore(false);
  };

  // ── 订阅钱包 ──

  const handleOpenSubscribe = async () => {
    setSubscribeLoading(true);
    setSubscribeError(null);
    try {
      const { wallets: allWallets } = await walletService.getAllWallets({ limit: 100 });
      const currentWalletIds = new Set(useWalletStore.getState().wallets.map((w) => w.id));
      const available = allWallets.filter((w) => !currentWalletIds.has(w.id));
      setSubscribeWallets(available);
      setShowSubscribeModal(true);
    } catch (err: unknown) {
      showToast(getErrorMessage(err, "加载钱包列表失败"));
    }
    setSubscribeLoading(false);
  };

  // 每次 handleOpenSubscribe 变化时更新 ref，确保导航栏按钮调用最新回调
  openSubscribeRef.current = handleOpenSubscribe;

  const handleSubscribeWallet = async (walletId: string) => {
    setSubscribing(true);
    setSubscribeError(null);
    try {
      await useWalletStore.getState().subscribeWallet(walletId);
      showToast("订阅成功");
      setShowSubscribeModal(false);
      const currentWalletIds = new Set(useWalletStore.getState().wallets.map((w) => w.id));
      setSubscribeWallets((prev) => prev.filter((w) => !currentWalletIds.has(w.id)));
    } catch (err: unknown) {
      setSubscribeError(getErrorMessage(err, "订阅失败，请重试"));
    }
    setSubscribing(false);
  };

  /** 卡片上直接订阅（快捷入口） */
  const handleQuickSubscribe = async (walletId: string) => {
    try {
      await useWalletStore.getState().subscribeWallet(walletId);
      showToast("订阅成功");
    } catch (err: unknown) {
      showToast(getErrorMessage(err, "订阅失败"));
    }
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
        renderItem={({ item: w }) => {
          const localSource = localWalletSourceMap.get(w.id);
          // walletTag: "local" | "subscribed" | "none"
          const walletTag: "local" | "subscribed" | "none" =
            localSource === "CREATE" || localSource === "IMPORT" ? "local"
            : localSource === "SUBSCRIBE" ? "subscribed"
            : "none";

          return (
            <View style={styles.walletCard}>
              {/* 卡片左上角标签 */}
              {walletTag === "local" && (
                <View style={styles.tagLocal}><Text style={styles.tagText}>本地</Text></View>
              )}
              {walletTag === "subscribed" && (
                <View style={styles.tagSubscribed}><Text style={styles.tagText}>已订阅</Text></View>
              )}
              {/* 钱包头部（点击展开/折叠） */}
              <TouchableOpacity
                style={styles.walletHeader}
                onPress={() => handleSelectWallet(w.id)}
                activeOpacity={0.7}
              >
                <View style={styles.walletIconWrap}>
                  <View style={styles.walletIconContainer}>
                    <WalletIcon size={24} color="#287220" />
                  </View>
                </View>
                <View style={styles.walletInfo}>
                  <View style={styles.walletNameRow}>
                    <Text style={styles.walletAlias} numberOfLines={1} ellipsizeMode="tail">{w.alias}</Text>
                    <Text style={styles.walletBalanceValue} numberOfLines={1}>¥{formatCny(w.totalBalanceCny)}</Text>
                    {/* 未订阅 → 右侧显示订阅按钮 */}
                    {walletTag === "none" && (
                      <TouchableOpacity
                        style={styles.cardSubscribeBtn}
                        onPress={() => handleQuickSubscribe(w.id)}
                        activeOpacity={0.7}
                      >
                        <SubscribeIcon size={16} color="#287220" />
                        <Text style={styles.cardSubscribeText}>订阅</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.walletIdentifier} numberOfLines={1} ellipsizeMode="middle" selectable>{w.id}</Text>
                  <View style={styles.walletMetaRow}>
                    <Text style={styles.walletMeta}>
                      {w.chains.length > 0 ? w.chains.join(" · ") : "无链"} · {w.deviceCount} 个设备关联
                    </Text>
                    <View style={[styles.chevronWrap, selectedWallet === w.id && styles.chevronExpanded]}>
                      <ChevronRightIcon size={18} color="#8899B8" />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>

              {/* 关联设备（折叠） */}
              {selectedWallet === w.id && w.devices.length > 0 && (
                <View style={styles.deviceSection}>
                  <Text style={styles.sectionLabel}>关联设备</Text>
                  {w.devices.map((d) => (
                    <View key={d.id} style={styles.deviceRow}>
                      <Text style={styles.deviceId} numberOfLines={1} ellipsizeMode="middle">{d.id}</Text>
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

              {/* 代币余额（折叠） */}
              {selectedWallet === w.id && w.assets.length > 0 && (
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

              {/* 展开区域 — 交易/充值数据（所有钱包默认可见，充值tab仅充值权限设备可见） */}
              {selectedWallet === w.id && (
                <View style={styles.expandPanel}>
                  {dataLoading ? (
                    <ActivityIndicator size="small" color="#287220" style={{ marginVertical: 16 }} />
                  ) : (
                    <>
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
                            const isReceive = walletAddresses.includes(t.toAddress);
                            const isSend = walletAddresses.includes(t.fromAddress);
                            const feeNum = parseFloat(t.fee) || 0;
                            const amountNum = parseFloat(t.amount) || 0;
                            const receivedNum = feeConfig.feeMode === "EXTRA" ? amountNum : amountNum - feeNum;
                            const directionLabel = isReceive ? "收到" : "发送";
                            const directionColor = isReceive ? "#10B981" : "#EF4444";
                            const displayAmount = isReceive ? receivedNum : amountNum;
                            const prefix = isReceive ? "+" : "-";
                            return (
                              <View key={t.id} style={styles.txCard}>
                                <View style={[styles.txLeftBar, { backgroundColor: directionColor }]} />
                                <View style={styles.txContent}>
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
                                    {prefix}{trimAmount(displayAmount)}
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
                                  {isSend && feeNum > 0 && (
                                    <Text style={styles.txFee} numberOfLines={1} ellipsizeMode="tail">手续费 {trimAmount(feeNum)} · 实到 {trimAmount(receivedNum)}</Text>
                                  )}
                                </View>
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
          );
        }}
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

      {/* 订阅钱包 Modal（导航栏 "+" 入口） */}
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
  listContent: { padding: 12, paddingBottom: 20 },
  endHint: { textAlign: "center", paddingVertical: 20, fontSize: 13, color: "#D1D5DB" },

  // ── 钱包卡片 ──
  walletCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    overflow: "hidden",
  },
  walletHeader: {
    flexDirection: "row", alignItems: "center",
    marginTop: 6,
  },
  walletIconWrap: {
    marginRight: 12,
  },
  walletIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  walletInfo: { flex: 1 },
  chevronWrap: {
    transform: [{ rotate: "0deg" }],
  },
  chevronExpanded: {
    transform: [{ rotate: "90deg" }],
  },
  walletAlias: { fontSize: 16, fontWeight: "600", color: "#1F2937", flex: 1, minWidth: 0 },
  walletNameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  walletBalanceValue: { fontSize: 15, fontWeight: "700", color: "#1F2937", flexShrink: 0 },
  walletIdentifier: { fontSize: 12, color: "#9CA3AF", fontFamily: "monospace", marginTop: 2 },
  walletMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  walletMeta: { fontSize: 13, color: "#9CA3AF" },

  // ── 钱包标签（卡片左上角） ──
  tagLocal: {
    position: "absolute",
    top: 0,
    left: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 16,
    backgroundColor: "#DCFCE7",
    zIndex: 10,
  },
  tagSubscribed: {
    position: "absolute",
    top: 0,
    left: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 16,
    backgroundColor: "#DBEAFE",
    zIndex: 10,
  },
  tagText: { fontSize: 10, fontWeight: "600", color: "#374151" },

  // ── 卡片上的订阅按钮 ──
  cardSubscribeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F0F7FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  cardSubscribeText: { fontSize: 13, fontWeight: "500", color: "#287220" },

  // ── 关联设备 ──
  deviceSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
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

  // ── 展开面板 ──
  expandPanel: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 16,
  },

  // ── 代币余额 ──
  assetSection: {
    marginBottom: 16,
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
    padding: 0,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  txLeftBar: {
    width: 3,
    alignSelf: "stretch",
  },
  txContent: {
    flex: 1,
    padding: 16,
  },
  txTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  txTokenWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  txTokenEmoji: { fontSize: 16 },
  txSymbol: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  txAmount: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  txDirection: { fontSize: 13, fontWeight: "500", marginLeft: 6 },
  txFee: { fontSize: 12, color: "#9CA3AF", flex: 1, textAlign: "right" },
  txAddrRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  txAddr: { fontSize: 13, color: "#6B7280", fontFamily: "monospace", flex: 1 },
  txAddrLabel: { fontSize: 13, fontWeight: "500", color: "#374151", marginRight: 6 },
  txArrow: { fontSize: 13, color: "#9CA3AF", fontWeight: "500" },
  txBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8 },
  txBottomLeft: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  txTime: { fontSize: 12, color: "#9CA3AF" },

  // ── 加载更多 ──
  loadMoreBtn: { paddingVertical: 10, alignItems: "center" },
  loadMoreBtnText: { fontSize: 13, color: "#287220", fontWeight: "500" },

  // ── Toast ──
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },

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
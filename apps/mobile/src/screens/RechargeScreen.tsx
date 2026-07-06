import React, { useState, useCallback, useRef } from "react";
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
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { assetService } from "../services/assetService";
import { localAddressService } from "../services/localAddressService";
import { localWalletService } from "../services/localWalletService";
import { walletService } from "../services/walletService";
import { rechargeService, type RechargeRecord } from "../services/rechargeService";
import type { SimpleWallet, AssetInfo, AddressEntry, ServerWalletAddress } from "../types";
import { TOKEN_ICONS, ChevronRightIcon, CopyIcon } from "../components/icons";
import { RechargeSkeleton } from "../components/Skeleton";
import { formatTime as formatDate } from "../utils/date";
import { copyToClipboard } from "../utils/clipboard";
import { getErrorMessage, trimAmount } from "../utils/format";

// ── 筛选类型定义 ──
type TimeFilter = "today" | "7d" | "30d" | "90d";

const TIME_OPTIONS: { label: string; value: TimeFilter }[] = [
  { label: "今日", value: "today" },
  { label: "近7天", value: "7d" },
  { label: "近30天", value: "30d" },
  { label: "近90天", value: "90d" },
];

/** 将 TimeFilter 转换为 ISO 8601 时间字符串 */
function timeFilterToRange(tf: TimeFilter): { startTime: string; endTime: string } {
  const now = new Date();
  // endTime: 当前时刻的明天0点（确保包含今天全天）
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  const endTime = end.toISOString();

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  switch (tf) {
    case "today":
      break;
    case "7d":
      start.setDate(start.getDate() - 6);
      break;
    case "30d":
      start.setDate(start.getDate() - 29);
      break;
    case "90d":
      start.setDate(start.getDate() - 89);
      break;
  }
  return { startTime: start.toISOString(), endTime };
}

export default function RechargeScreen() {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<SimpleWallet | null>(null);
  const [selectedToken, setSelectedToken] = useState<AssetInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // 服务端钱包列表（搜索+分页）— 充值表单用
  const [serverWallets, setServerWallets] = useState<SimpleWallet[]>([]);
  const [serverWalletsTotal, setServerWalletsTotal] = useState(0);
  const [serverWalletsPage, setServerWalletsPage] = useState(1);
  const [serverWalletsLoading, setServerWalletsLoading] = useState(false);
  const [walletSearch, setWalletSearch] = useState("");
  const [serverAddresses, setServerAddresses] = useState<ServerWalletAddress[]>([]);

  // 充值记录
  const [records, setRecords] = useState<RechargeRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formCollapsed, setFormCollapsed] = useState(true);

  // ── 筛选状态 ──
  const [filterWallet, setFilterWallet] = useState<SimpleWallet | null>(null);
  const [filterTime, setFilterTime] = useState<TimeFilter | null>(null);
  const [timeExpanded, setTimeExpanded] = useState(false);

  // 筛选用的钱包列表（独立于充值表单）
  const [filterWallets, setFilterWallets] = useState<SimpleWallet[]>([]);
  const [filterWalletsTotal, setFilterWalletsTotal] = useState(0);
  const [filterWalletsPage, setFilterWalletsPage] = useState(1);
  const [filterWalletsLoading, setFilterWalletsLoading] = useState(false);
  const [filterWalletSearch, setFilterWalletSearch] = useState("");

  // 地址本缓存
  const [addressMap, setAddressMap] = useState<Map<string, AddressEntry>>(new Map());

  // 选择器弹窗
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [showFilterWalletPicker, setShowFilterWalletPicker] = useState(false);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  const loadData = async () => {
    try {
      const [assetsRes, contacts] = await Promise.all([
        assetService.getAssets(),
        localAddressService.getAllContacts(),
      ]);
      setAssets(assetsRes.assets);
      const map = new Map<string, AddressEntry>();
      for (const c of contacts) {
        map.set(c.address, c);
      }
      setAddressMap(map);
    } catch {
      showToast("加载数据失败");
    }
  };

  const getAssetAddress = (asset: AssetInfo): string => {
    if (!selectedWallet) return "";
    const addr = serverAddresses.find((a) => a.chain === asset.chain);
    return addr?.address || "";
  };

  const shortAddr = (addr: string): string => {
    if (!addr) return "";
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  };

  const handleSelectWallet = async (wallet: SimpleWallet) => {
    setSelectedWallet(wallet);
    setShowWalletPicker(false);
    try {
      const { addresses } = await walletService.getWalletAddresses(wallet.id);
      setServerAddresses(addresses);
      if (selectedToken && !addresses.some((a) => a.chain === selectedToken.chain)) {
        setSelectedToken(null);
      }
    } catch {
      setServerAddresses([]);
      setSelectedToken(null);
      showToast("获取钱包地址失败");
    }
  };

  // ── 充值表单：钱包列表 ──
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadServerWallets = async (page = 1, search = "", append = false) => {
    if (serverWalletsLoading) return;
    setServerWalletsLoading(true);
    try {
      const res = await walletService.getAllWallets({
        search: search || undefined,
        page,
        limit: 20,
      });
      const localWallets = await localWalletService.getAllWallets();
      const localNameMap = new Map(localWallets.map((w) => [w.id, w.name]));
      const mergedWallets = res.wallets.map((w) => {
        const localName = localNameMap.get(w.id);
        return localName ? { ...w, name: localName } : w;
      });
      setServerWallets((prev) => (append ? [...prev, ...mergedWallets] : mergedWallets));
      setServerWalletsTotal(res.total);
      setServerWalletsPage(page);
    } catch {
      if (!append) setServerWallets([]);
    }
    setServerWalletsLoading(false);
  };

  const openWalletPicker = () => {
    setShowWalletPicker(true);
    setWalletSearch("");
    setServerWallets([]);
    setServerWalletsPage(1);
    loadServerWallets(1, "");
  };

  const handleWalletSearch = (text: string) => {
    setWalletSearch(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadServerWallets(1, text);
    }, 300);
  };

  const handleWalletLoadMore = () => {
    if (serverWallets.length < serverWalletsTotal && !serverWalletsLoading) {
      loadServerWallets(serverWalletsPage + 1, walletSearch, true);
    }
  };

  // ── 筛选钱包列表 ──
  const filterSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFilterWallets = async (page = 1, search = "", append = false) => {
    if (filterWalletsLoading) return;
    setFilterWalletsLoading(true);
    try {
      const res = await walletService.getAllWallets({
        search: search || undefined,
        page,
        limit: 20,
      });
      const localWallets = await localWalletService.getAllWallets();
      const localNameMap = new Map(localWallets.map((w) => [w.id, w.name]));
      const mergedWallets = res.wallets.map((w) => {
        const localName = localNameMap.get(w.id);
        return localName ? { ...w, name: localName } : w;
      });
      setFilterWallets((prev) => (append ? [...prev, ...mergedWallets] : mergedWallets));
      setFilterWalletsTotal(res.total);
      setFilterWalletsPage(page);
    } catch {
      if (!append) setFilterWallets([]);
    }
    setFilterWalletsLoading(false);
  };

  const openFilterWalletPicker = () => {
    setShowFilterWalletPicker(true);
    setFilterWalletSearch("");
    setFilterWallets([]);
    setFilterWalletsPage(1);
    loadFilterWallets(1, "");
  };

  const handleFilterWalletSearch = (text: string) => {
    setFilterWalletSearch(text);
    if (filterSearchTimerRef.current) clearTimeout(filterSearchTimerRef.current);
    filterSearchTimerRef.current = setTimeout(() => {
      loadFilterWallets(1, text);
    }, 300);
  };

  const handleFilterWalletLoadMore = () => {
    if (filterWallets.length < filterWalletsTotal && !filterWalletsLoading) {
      loadFilterWallets(filterWalletsPage + 1, filterWalletSearch, true);
    }
  };

  // ── 加载充值记录 ──
  const loadRecords = async (page = 1, append = false, showLoading = true) => {
    if (showLoading) setRecordsLoading(true);
    try {
      const filters: { walletId?: string; startTime?: string; endTime?: string } = {};
      if (filterWallet) filters.walletId = filterWallet.id;
      if (filterTime) {
        const range = timeFilterToRange(filterTime);
        filters.startTime = range.startTime;
        filters.endTime = range.endTime;
      }

      const res = await rechargeService.getAllRechargeRecords(page, 20, filters);
      setRecords((prev) => (append ? [...prev, ...res.recharges] : res.recharges));
      setRecordsTotal(res.total);
      setRecordsPage(page);
    } catch {
      if (!append) setRecords([]);
    }
    if (showLoading) setRecordsLoading(false);
  };

  // 筛选条件变化时重新加载第1页
  React.useEffect(() => {
    if (!loading) {
      loadRecords(1, false, true);
    }
  }, [filterWallet, filterTime]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setRecordsLoading(true);
      Promise.all([loadData(), loadRecords(1, false, false)]).finally(() => {
        setLoading(false);
        setRecordsLoading(false);
      });
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), loadRecords(1)]);
    setRefreshing(false);
  };

  const handleLoadMore = () => {
    if (records.length < recordsTotal && !recordsLoading) {
      loadRecords(recordsPage + 1, true);
    }
  };

  const handleRecharge = async () => {
    if (!selectedWallet) { showToast("请选择钱包"); return; }
    if (!selectedToken) { showToast("请选择代币"); return; }
    const trimmed = amount.trim();
    if (!trimmed) { showToast("请输入充值金额"); return; }
    const numVal = parseFloat(trimmed);
    if (isNaN(numVal) || numVal <= 0) { showToast("充值金额必须大于 0"); return; }
    setSubmitting(true);
    try {
      const accountAddress = getAssetAddress(selectedToken);
      if (!accountAddress) { showToast("该钱包在此网络下无地址"); setSubmitting(false); return; }
      await rechargeService.recharge({
        walletId: selectedWallet.id,
        walletAlias: selectedWallet.name,
        tokenSymbol: selectedToken.symbol,
        network: selectedToken.chain,
        accountAddress,
        amount: trimmed,
        memo: memo.trim() || undefined,
      });
      showToast("充值成功");
      setAmount("");
      setMemo("");
      await loadRecords(1);
    } catch (err: unknown) {
      showToast(getErrorMessage(err, "充值失败，请重试"));
    }
    setSubmitting(false);
  };

  const canSubmit = !!selectedWallet && !!selectedToken && !!amount.trim() && !submitting;

  const handleCopyAddress = useCallback(async (address: string) => {
    const ok = await copyToClipboard(address);
    showToast(ok ? "地址已复制" : "复制失败");
  }, [showToast]);

  const clearFilters = () => {
    setFilterWallet(null);
    setFilterTime(null);
    setTimeExpanded(false);
  };

  const hasActiveFilter = filterWallet !== null || filterTime !== null;

  const renderRecord = ({ item }: { item: RechargeRecord }) => {
    const contact = addressMap.get(item.accountAddress);
    const contactLabel = contact ? (contact.memo || contact.name) : null;

    return (
      <View style={styles.recordCard}>
        <View style={styles.recordHeader}>
          <View style={styles.recordTokenWrap}>
            {TOKEN_ICONS[item.tokenSymbol] ? (
              React.createElement(TOKEN_ICONS[item.tokenSymbol], { size: 20 })
            ) : (
              <Text style={styles.recordTokenEmoji}>🪙</Text>
            )}
            <Text style={styles.recordToken}>{item.tokenSymbol}</Text>
          </View>
          <Text style={styles.recordAmount}>+{trimAmount(item.amount)}</Text>
        </View>
        <View style={styles.recordBody}>
          <View style={styles.recordAddressRow}>
            {contactLabel ? (
              <Text style={styles.recordContactName} numberOfLines={1}>{contactLabel}</Text>
            ) : null}
            <Text style={styles.recordAddress} numberOfLines={1} ellipsizeMode="middle">{item.accountAddress}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={() => handleCopyAddress(item.accountAddress)} activeOpacity={0.6}>
              <CopyIcon size={14} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <View style={styles.recordFooterRow}>
            <Text style={styles.recordMemo} numberOfLines={1}>{item.memo ? `备注: ${item.memo}` : ""}</Text>
            <Text style={styles.recordMeta}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <RechargeSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderRecord}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={["#287220"]} />}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <View>
            {/* 充值表单 */}
            <View style={styles.formCard}>
              <TouchableOpacity style={styles.formHeader} onPress={() => setFormCollapsed((v) => !v)} activeOpacity={0.7}>
                <Text style={styles.formTitle}>代币充值</Text>
                <Text style={styles.collapseIcon}>{formCollapsed ? "▶" : "▼"}</Text>
              </TouchableOpacity>

              {!formCollapsed && (
              <>
              <Text style={styles.fieldLabel}>选择钱包</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={openWalletPicker} activeOpacity={0.7}>
                <Text style={selectedWallet ? styles.pickerBtnText : styles.pickerBtnPlaceholder}>
                  {selectedWallet ? `${selectedWallet.name}(${shortAddr(selectedWallet.id)})` : "请选择钱包"}
                </Text>
                <ChevronRightIcon size={18} color="#9CA3AF" />
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>选择代币</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTokenPicker(true)} activeOpacity={0.7}>
                <View style={styles.tokenPickerLeft}>
                  {selectedToken && TOKEN_ICONS[selectedToken.symbol] ? React.createElement(TOKEN_ICONS[selectedToken.symbol], { size: 18 }) : null}
                  <Text style={selectedToken ? styles.pickerBtnText : styles.pickerBtnPlaceholder}>
                    {selectedToken ? `${selectedToken.symbol} · ${shortAddr(getAssetAddress(selectedToken))}` : "请选择代币"}
                  </Text>
                </View>
                <ChevronRightIcon size={18} color="#9CA3AF" />
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>充值金额</Text>
              <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="请输入充值金额" placeholderTextColor="#C8C9CC" keyboardType="decimal-pad" />

              <Text style={styles.fieldLabel}>备注（可选）</Text>
              <TextInput style={styles.input} value={memo} onChangeText={setMemo} placeholder="添加备注" placeholderTextColor="#C8C9CC" />

              <TouchableOpacity style={[styles.rechargeBtn, !canSubmit && styles.rechargeBtnDisabled]} onPress={handleRecharge} disabled={!canSubmit} activeOpacity={0.7}>
                {submitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.rechargeBtnText}>充值</Text>}
              </TouchableOpacity>
              </>
              )}
            </View>

            {/* 充值记录标题 */}
            <View style={styles.recordsHeader}>
              <Text style={styles.recordsTitle}>充值记录</Text>
              {recordsTotal > 0 && <Text style={styles.recordsCount}>共 {recordsTotal} 条</Text>}
            </View>

            {/* ── 筛选条 ── */}
            <View style={styles.filterBar}>
              {/* 钱包筛选 pill */}
              <TouchableOpacity
                style={[styles.filterPill, filterWallet && styles.filterPillActive]}
                onPress={openFilterWalletPicker}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterPillText, filterWallet && styles.filterPillTextActive]} numberOfLines={1}>
                  {filterWallet ? filterWallet.name : "钱包"}
                </Text>
                {filterWallet && (
                  <TouchableOpacity onPress={() => setFilterWallet(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={styles.filterPillClear}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {/* 时间筛选 pill */}
              <TouchableOpacity
                style={[styles.filterPill, filterTime && styles.filterPillActive]}
                onPress={() => {
                  if (filterTime === null) {
                    setFilterTime("today");
                    setTimeExpanded(true);
                  } else {
                    setTimeExpanded((v) => !v);
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterPillText, filterTime && styles.filterPillTextActive]} numberOfLines={1}>
                  {filterTime ? TIME_OPTIONS.find((o) => o.value === filterTime)?.label || "时间" : "时间"}
                </Text>
                {filterTime && (
                  <TouchableOpacity onPress={() => { setFilterTime(null); setTimeExpanded(false); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={styles.filterPillClear}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {/* 清除筛选 */}
              {hasActiveFilter && (
                <TouchableOpacity style={styles.filterClearAll} onPress={clearFilters} activeOpacity={0.7}>
                  <Text style={styles.filterClearAllText}>清除</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── 时间快捷选项 ── */}
            {timeExpanded && filterTime !== null && (
              <View style={styles.timeChipRow}>
                {TIME_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.timeChip, filterTime === opt.value && styles.timeChipActive]}
                    onPress={() => setFilterTime(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.timeChipText, filterTime === opt.value && styles.timeChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          recordsLoading || loading ? null : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>暂无充值记录</Text>
            </View>
          )
        }
        ListFooterComponent={
          recordsLoading && records.length > 0 ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator size="small" color="#9CA3AF" />
            </View>
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />

      {/* ── 充值表单：钱包选择器 ── */}
      <Modal visible={showWalletPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowWalletPicker(false)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>选择钱包</Text>
            <TextInput style={styles.walletSearchInput} value={walletSearch} onChangeText={handleWalletSearch} placeholder="搜索钱包名称" placeholderTextColor="#C8C9CC" />
            <FlatList
              data={serverWallets}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.pickerItem, selectedWallet?.id === item.id && styles.pickerItemActive]} onPress={() => handleSelectWallet(item)}>
                  <Text style={styles.pickerItemName}>{item.name}({shortAddr(item.id)})</Text>
                </TouchableOpacity>
              )}
              onEndReached={handleWalletLoadMore}
              onEndReachedThreshold={0.3}
              ListEmptyComponent={serverWalletsLoading ? null : <View style={styles.pickerEmpty}><Text style={styles.pickerEmptyText}>无匹配钱包</Text></View>}
              ListFooterComponent={serverWalletsLoading ? <View style={styles.pickerLoading}><ActivityIndicator size="small" color="#9CA3AF" /></View> : null}
              style={{ maxHeight: 350 }}
            />
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setShowWalletPicker(false)}>
              <Text style={styles.pickerCancelText}>取消</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 充值表单：代币选择器 ── */}
      <Modal visible={showTokenPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowTokenPicker(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>选择代币</Text>
            <FlatList
              data={assets.filter((a) => serverAddresses.some((addr) => addr.chain === a.chain))}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.pickerItem, selectedToken?.id === item.id && styles.pickerItemActive]} onPress={() => { setSelectedToken(item); setShowTokenPicker(false); }}>
                  <View style={styles.tokenPickerLeft}>
                    {TOKEN_ICONS[item.symbol] ? React.createElement(TOKEN_ICONS[item.symbol], { size: 20 }) : <Text style={styles.recordTokenEmoji}>🪙</Text>}
                    <View>
                      <Text style={styles.pickerItemName}>{item.symbol}</Text>
                      <Text style={styles.pickerItemAddr}>{selectedWallet ? shortAddr(getAssetAddress(item)) : `${item.name} · ${item.chain}`}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 350 }}
            />
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setShowTokenPicker(false)}>
              <Text style={styles.pickerCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── 筛选：钱包选择器 ── */}
      <Modal visible={showFilterWalletPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilterWalletPicker(false)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>筛选钱包</Text>
            <TouchableOpacity style={[styles.pickerItem, !filterWallet && styles.pickerItemActive]} onPress={() => { setFilterWallet(null); setShowFilterWalletPicker(false); }}>
              <Text style={styles.pickerItemName}>全部钱包</Text>
            </TouchableOpacity>
            <TextInput style={styles.walletSearchInput} value={filterWalletSearch} onChangeText={handleFilterWalletSearch} placeholder="搜索钱包名称" placeholderTextColor="#C8C9CC" />
            <FlatList
              data={filterWallets}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.pickerItem, filterWallet?.id === item.id && styles.pickerItemActive]} onPress={() => { setFilterWallet(item); setShowFilterWalletPicker(false); }}>
                  <Text style={styles.pickerItemName}>{item.name}({shortAddr(item.id)})</Text>
                </TouchableOpacity>
              )}
              onEndReached={handleFilterWalletLoadMore}
              onEndReachedThreshold={0.3}
              ListEmptyComponent={filterWalletsLoading ? null : <View style={styles.pickerEmpty}><Text style={styles.pickerEmptyText}>无匹配钱包</Text></View>}
              ListFooterComponent={filterWalletsLoading ? <View style={styles.pickerLoading}><ActivityIndicator size="small" color="#9CA3AF" /></View> : null}
              style={{ maxHeight: 300 }}
            />
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setShowFilterWalletPicker(false)}>
              <Text style={styles.pickerCancelText}>取消</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F6F8" },
  listContent: { padding: 16, paddingBottom: 40 },
  // Form card
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  formHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  formTitle: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  collapseIcon: { fontSize: 14, color: "#9CA3AF" },
  fieldLabel: { fontSize: 13, color: "#6B7280", marginBottom: 6, marginTop: 10 },
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
  },
  pickerBtnText: { fontSize: 14, color: "#1F2937", fontWeight: "500" },
  pickerBtnPlaceholder: { fontSize: 14, color: "#C8C9CC" },
  tokenPickerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1F2937",
    backgroundColor: "#F9FAFB",
  },
  rechargeBtn: { backgroundColor: "#287220", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  rechargeBtnDisabled: { backgroundColor: "#A5D6A7" },
  rechargeBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  // Records header
  recordsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  recordsTitle: { fontSize: 15, fontWeight: "600", color: "#374151" },
  recordsCount: { fontSize: 13, color: "#9CA3AF" },
  // ── 筛选条 ──
  filterBar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    maxWidth: 120,
  },
  filterPillActive: { backgroundColor: "#DBEAFE" },
  filterPillText: { fontSize: 13, color: "#6B7280", fontWeight: "500", flexShrink: 1 },
  filterPillTextActive: { color: "#3B82F6" },
  filterPillClear: { fontSize: 13, color: "#3B82F6", marginLeft: 4, fontWeight: "600" },
  filterClearAll: { paddingHorizontal: 8, paddingVertical: 6 },
  filterClearAllText: { fontSize: 12, color: "#9CA3AF", fontWeight: "500" },
  // ── 时间快捷选项 ──
  timeChipRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  timeChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: "#F3F4F6" },
  timeChipActive: { backgroundColor: "#3B82F6" },
  timeChipText: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  timeChipTextActive: { color: "#FFFFFF" },
  // Record card
  recordCard: {
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
  recordHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  recordTokenWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  recordToken: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  recordTokenEmoji: { fontSize: 16 },
  recordAmount: { fontSize: 16, fontWeight: "700", color: "#287220" },
  recordBody: { gap: 4 },
  recordAddressRow: { flexDirection: "row", alignItems: "center" },
  recordContactName: { fontSize: 13, color: "#3B82F6", fontWeight: "500", marginRight: 8 },
  recordAddress: { fontSize: 12, color: "#9CA3AF", fontFamily: "monospace", flex: 1 },
  copyBtn: { padding: 4, flexShrink: 0, marginLeft: 4 },
  recordFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recordMemo: { fontSize: 12, color: "#9CA3AF", flex: 1 },
  recordMeta: { fontSize: 11, color: "#9CA3AF", flexShrink: 0, marginLeft: 8 },
  // Empty
  emptyWrap: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
  // Footer loading
  footerLoading: { paddingVertical: 16, alignItems: "center" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  pickerCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 20 },
  pickerTitle: { fontSize: 17, fontWeight: "700", color: "#1F2937", textAlign: "center", marginBottom: 16 },
  pickerItem: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  pickerItemActive: { backgroundColor: "#E8F5E9", borderRadius: 8 },
  pickerItemName: { fontSize: 15, fontWeight: "500", color: "#1F2937" },
  pickerItemAddr: { fontSize: 12, color: "#9CA3AF", fontFamily: "monospace", marginTop: 2 },
  walletSearchInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#1F2937",
    backgroundColor: "#F9FAFB",
    marginBottom: 12,
  },
  pickerLoading: { paddingVertical: 12, alignItems: "center" },
  pickerEmpty: { paddingVertical: 24, alignItems: "center" },
  pickerEmptyText: { fontSize: 14, color: "#9CA3AF" },
  pickerCancelBtn: { padding: 14, marginTop: 12, backgroundColor: "#F3F4F6", borderRadius: 10, alignItems: "center" },
  pickerCancelText: { color: "#6B7280", fontWeight: "600" },
  // Toast
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
});
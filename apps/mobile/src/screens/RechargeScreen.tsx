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
import { walletService } from "../services/walletService";
import { assetService } from "../services/assetService";
import { localAddressService } from "../services/localAddressService";
import { localWalletService } from "../services/localWalletService";
import { rechargeService, type RechargeRecord } from "../services/rechargeService";
import type { SimpleWallet, AssetInfo, AddressEntry, ServerWalletAddress } from "../types";
import { TronIcon, USDTIcon, ChevronRightIcon, CopyIcon } from "../components/icons";
import { RechargeSkeleton } from "../components/Skeleton";
import { formatTime as formatDate } from "../utils/date";

/** 预置代币图标映射 */
const TOKEN_ICONS: Record<string, React.FC<{ size?: number }>> = {
  TRX: TronIcon,
  USDT: USDTIcon,
};

export default function RechargeScreen() {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<SimpleWallet | null>(null);
  const [selectedToken, setSelectedToken] = useState<AssetInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formCollapsed, setFormCollapsed] = useState(true);

  // 服务端钱包列表（搜索+分页）
  const [serverWallets, setServerWallets] = useState<SimpleWallet[]>([]);
  const [serverWalletsTotal, setServerWalletsTotal] = useState(0);
  const [serverWalletsPage, setServerWalletsPage] = useState(1);
  const [serverWalletsLoading, setServerWalletsLoading] = useState(false);
  const [walletSearch, setWalletSearch] = useState("");
  // 选中钱包的链上地址（从服务端获取）
  const [serverAddresses, setServerAddresses] = useState<ServerWalletAddress[]>([]);

  // 充值记录
  const [records, setRecords] = useState<RechargeRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 地址本缓存（用于充值记录中匹配联系人名称）
  const [addressMap, setAddressMap] = useState<Map<string, AddressEntry>>(new Map());

  // 选择器弹窗
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [showTokenPicker, setShowTokenPicker] = useState(false);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assetsRes, contacts] = await Promise.all([
        assetService.getAssets(),
        localAddressService.getAllContacts(),
      ]);
      setAssets(assetsRes.assets);
      // 构建 address → AddressEntry 映射（用于充值记录匹配联系人名称）
      const map = new Map<string, AddressEntry>();
      for (const c of contacts) {
        map.set(c.address, c);
      }
      setAddressMap(map);
    } catch {
      showToast("加载数据失败");
    }
    setLoading(false);
  };

  /** 根据代币网络获取钱包在该网络上的链地址 */
  const getAssetAddress = (asset: AssetInfo): string => {
    if (!selectedWallet) return "";
    const addr = serverAddresses.find((a) => a.chain === asset.chain);
    return addr?.address || "";
  };

  /** 地址截断显示 */
  const shortAddr = (addr: string): string => {
    if (!addr) return "";
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  };

  /** 选择钱包后从服务端获取该钱包的链上地址列表 */
  const handleSelectWallet = async (wallet: SimpleWallet) => {
    setSelectedWallet(wallet);
    setShowWalletPicker(false);
    try {
      const { addresses } = await walletService.getWalletAddresses(wallet.id);
      setServerAddresses(addresses);
      // 清空已选代币（如果新钱包没有对应链的地址）
      if (selectedToken && !addresses.some((a) => a.chain === selectedToken.chain)) {
        setSelectedToken(null);
      }
    } catch {
      setServerAddresses([]);
      setSelectedToken(null);
      showToast("获取钱包地址失败");
    }
  };

  // ── 服务端钱包列表（搜索+分页） ──────────────────────────────────────────
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 从服务端加载钱包列表（支持搜索+分页）
   *  如果钱包 ID 在本地存在，优先使用本地名称（本地名称可能是用户修改后的最新名称） */
  const loadServerWallets = async (page = 1, search = "", append = false) => {
    if (serverWalletsLoading) return;
    setServerWalletsLoading(true);
    try {
      const res = await walletService.getAllWallets({
        search: search || undefined,
        page,
        limit: 20,
      });
      // 用本地钱包名称覆盖服务端名称（本地名称优先，可能是用户修改后的最新名称）
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

  /** 打开钱包选择器：重置搜索并加载第一页 */
  const openWalletPicker = () => {
    setShowWalletPicker(true);
    setWalletSearch("");
    setServerWallets([]);
    setServerWalletsPage(1);
    loadServerWallets(1, "");
  };

  /** 搜索输入（防抖 300ms） */
  const handleWalletSearch = (text: string) => {
    setWalletSearch(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadServerWallets(1, text);
    }, 300);
  };

  /** 钱包列表加载更多 */
  const handleWalletLoadMore = () => {
    if (serverWallets.length < serverWalletsTotal && !serverWalletsLoading) {
      loadServerWallets(serverWalletsPage + 1, walletSearch, true);
    }
  };

  const loadRecords = async (page = 1, append = false) => {
    if (recordsLoading) return;
    setRecordsLoading(true);
    try {
      const res = await rechargeService.getRecharges({ page, limit: 20 });
      setRecords((prev) => (append ? [...prev, ...res.recharges] : res.recharges));
      setRecordsTotal(res.total);
      setRecordsPage(page);
    } catch {
      if (!append) setRecords([]);
    }
    setRecordsLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      loadRecords(1);
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
    if (!selectedWallet) {
      showToast("请选择钱包");
      return;
    }
    if (!selectedToken) {
      showToast("请选择代币");
      return;
    }
    const trimmed = amount.trim();
    if (!trimmed) {
      showToast("请输入充值金额");
      return;
    }
    const numVal = parseFloat(trimmed);
    if (isNaN(numVal) || numVal <= 0) {
      showToast("充值金额必须大于 0");
      return;
    }
    setSubmitting(true);
    try {
      const accountAddress = getAssetAddress(selectedToken);
      if (!accountAddress) {
        showToast("该钱包在此网络下无地址");
        setSubmitting(false);
        return;
      }
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
    } catch (err: any) {
      const serverError = err?.response?.data?.error || "充值失败，请重试";
      showToast(serverError);
    }
    setSubmitting(false);
  };

  const canSubmit = !!selectedWallet && !!selectedToken && !!amount.trim() && !submitting;

  /** 复制地址到剪贴板 */
  const handleCopyAddress = useCallback(async (address: string) => {
    try {
      const Clipboard = require("expo-clipboard");
      await Clipboard.setStringAsync(address);
      showToast("地址已复制");
    } catch {
      showToast("复制失败");
    }
  }, [showToast]);

  const renderRecord = ({ item }: { item: RechargeRecord }) => {
    // 匹配地址本：优先显示备注，没有备注用名称
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
        <Text style={styles.recordAmount}>+{parseFloat(item.amount).toFixed(6)}</Text>
      </View>
      <View style={styles.recordBody}>
        {/* 账户地址行：联系人名称 + 地址 + 复制icon */}
        <View style={styles.recordAddressRow}>
          {contactLabel ? (
            <Text style={styles.recordContactName} numberOfLines={1}>
              {contactLabel}
            </Text>
          ) : null}
          <Text style={styles.recordAddress} numberOfLines={1} ellipsizeMode="middle">
            {item.accountAddress}
          </Text>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={() => handleCopyAddress(item.accountAddress)}
            activeOpacity={0.6}
          >
            <CopyIcon size={14} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        {/* 备注行：左侧备注 + 右侧充值时间 */}
        <View style={styles.recordFooterRow}>
          <Text style={styles.recordMemo} numberOfLines={1}>
            {item.memo ? `备注: ${item.memo}` : ""}
          </Text>
          <Text style={styles.recordMeta}>
            {formatDate(item.createdAt)}
          </Text>
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
              <TouchableOpacity
                style={styles.formHeader}
                onPress={() => setFormCollapsed((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.formTitle}>代币充值</Text>
                <Text style={styles.collapseIcon}>{formCollapsed ? "▶" : "▼"}</Text>
              </TouchableOpacity>

              {!formCollapsed && (
              <>
              {/* 选择钱包 */}
              <Text style={styles.fieldLabel}>选择钱包</Text>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={openWalletPicker}
                activeOpacity={0.7}
              >
                <Text style={selectedWallet ? styles.pickerBtnText : styles.pickerBtnPlaceholder}>
                  {selectedWallet ? `${selectedWallet.name}` : "请选择钱包"}
                </Text>
                <ChevronRightIcon size={18} color="#9CA3AF" />
              </TouchableOpacity>

              {/* 选择代币 */}
              <Text style={styles.fieldLabel}>选择代币</Text>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => setShowTokenPicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.tokenPickerLeft}>
                  {selectedToken && TOKEN_ICONS[selectedToken.symbol]
                    ? React.createElement(TOKEN_ICONS[selectedToken.symbol], { size: 18 })
                    : null}
                <Text style={selectedToken ? styles.pickerBtnText : styles.pickerBtnPlaceholder}>
                  {selectedToken
                    ? `${selectedToken.symbol} · ${shortAddr(getAssetAddress(selectedToken))}`
                    : "请选择代币"}
                </Text>                </View>
                <ChevronRightIcon size={18} color="#9CA3AF" />
              </TouchableOpacity>

              {/* 充值金额 */}
              <Text style={styles.fieldLabel}>充值金额</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="请输入充值金额"
                placeholderTextColor="#C8C9CC"
                keyboardType="decimal-pad"
              />

              {/* 备注 */}
              <Text style={styles.fieldLabel}>备注（可选）</Text>
              <TextInput
                style={styles.input}
                value={memo}
                onChangeText={setMemo}
                placeholder="添加备注"
                placeholderTextColor="#C8C9CC"
              />

              {/* 充值按钮 */}
              <TouchableOpacity
                style={[styles.rechargeBtn, !canSubmit && styles.rechargeBtnDisabled]}
                onPress={handleRecharge}
                disabled={!canSubmit}
                activeOpacity={0.7}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.rechargeBtnText}>充值</Text>
                )}
              </TouchableOpacity>
              </>
              )}
            </View>

            {/* 充值记录标题 */}
            <View style={styles.recordsHeader}>
              <Text style={styles.recordsTitle}>充值记录</Text>
              {recordsTotal > 0 && (
                <Text style={styles.recordsCount}>共 {recordsTotal} 条</Text>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>暂无充值记录</Text>
          </View>
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

      {/* 钱包选择器 */}
      {/* 钱包选择器（服务端搜索+分页） */}
      <Modal visible={showWalletPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowWalletPicker(false)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>选择钱包</Text>
            {/* 搜索框 */}
            <TextInput
              style={styles.walletSearchInput}
              value={walletSearch}
              onChangeText={handleWalletSearch}
              placeholder="搜索钱包名称"
              placeholderTextColor="#C8C9CC"
            />
            <FlatList
              data={serverWallets}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, selectedWallet?.id === item.id && styles.pickerItemActive]}
                  onPress={() => handleSelectWallet(item)}
                >
                  <View>
                    <Text style={styles.pickerItemName}>{item.name}</Text>
                  </View>
                </TouchableOpacity>
              )}
              onEndReached={handleWalletLoadMore}
              onEndReachedThreshold={0.3}
              ListEmptyComponent={
                serverWalletsLoading ? null : (
                  <View style={styles.pickerEmpty}>
                    <Text style={styles.pickerEmptyText}>无匹配钱包</Text>
                  </View>
                )
              }
              ListFooterComponent={
                serverWalletsLoading ? (
                  <View style={styles.pickerLoading}>
                    <ActivityIndicator size="small" color="#9CA3AF" />
                  </View>
                ) : null
              }
              style={{ maxHeight: 350 }}
            />
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setShowWalletPicker(false)}>
              <Text style={styles.pickerCancelText}>取消</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 代币选择器 */}
      <Modal visible={showTokenPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowTokenPicker(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>选择代币</Text>
            <FlatList
              data={assets.filter((a) => serverAddresses.some((addr) => addr.chain === a.chain))}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, selectedToken?.id === item.id && styles.pickerItemActive]}
                  onPress={() => {
                    setSelectedToken(item);
                    setShowTokenPicker(false);
                  }}
                >
                  <View style={styles.tokenPickerLeft}>
                    {TOKEN_ICONS[item.symbol]
                      ? React.createElement(TOKEN_ICONS[item.symbol], { size: 20 })
                      : <Text style={styles.recordTokenEmoji}>🪙</Text>}
                    <View>
                      <Text style={styles.pickerItemName}>{item.symbol}</Text>
                      <Text style={styles.pickerItemAddr}>
                        {selectedWallet
                          ? shortAddr(getAssetAddress(item))
                          : `${item.name} · ${item.chain}`}
                      </Text>
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
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
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
  rechargeBtn: {
    backgroundColor: "#287220",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  rechargeBtnDisabled: { backgroundColor: "#A5D6A7" },
  rechargeBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  // Records header
  recordsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  recordsTitle: { fontSize: 15, fontWeight: "600", color: "#374151" },
  recordsCount: { fontSize: 13, color: "#9CA3AF" },
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
  recordHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  recordTokenWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  recordToken: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  recordTokenEmoji: { fontSize: 16 },
  recordAmount: { fontSize: 16, fontWeight: "700", color: "#287220" },
  recordBody: { gap: 4 },
  // 账户地址行
  recordAddressRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  recordContactName: {
    fontSize: 13,
    color: "#3B82F6",
    fontWeight: "500",
    marginRight: 8,
  },
  recordAddress: { fontSize: 12, color: "#9CA3AF", fontFamily: "monospace", flex: 1 },
  copyBtn: { padding: 4, flexShrink: 0, marginLeft: 4 },
  // 备注行
  recordFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recordMemo: { fontSize: 12, color: "#9CA3AF", flex: 1 },
  recordMeta: { fontSize: 11, color: "#9CA3AF", flexShrink: 0, marginLeft: 8 },
  // Empty
  emptyWrap: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
  // Footer loading
  footerLoading: { paddingVertical: 16, alignItems: "center" },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  pickerCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 20 },
  pickerTitle: { fontSize: 17, fontWeight: "700", color: "#1F2937", textAlign: "center", marginBottom: 16 },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
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
  pickerCancelBtn: {
    padding: 14,
    marginTop: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    alignItems: "center",
  },
  pickerCancelText: { color: "#6B7280", fontWeight: "600" },
  // Toast
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
});
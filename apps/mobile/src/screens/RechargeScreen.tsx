import React, { useState, useCallback } from "react";
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
import { accountService } from "../services/accountService";
import { rechargeService, type RechargeRecord } from "../services/rechargeService";
import type { SimpleWallet, AssetInfo, Account } from "../types";
import { TronIcon, USDTIcon, ChevronRightIcon } from "../components/icons";
import { RechargeSkeleton } from "../components/Skeleton";

/** 预置代币图标映射 */
const TOKEN_ICONS: Record<string, React.FC<{ size?: number }>> = {
  TRX: TronIcon,
  USDT: USDTIcon,
};

export default function RechargeScreen() {
  const [wallets, setWallets] = useState<SimpleWallet[]>([]);
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<SimpleWallet | null>(null);
  const [walletAccounts, setWalletAccounts] = useState<Account[]>([]);
  const [selectedToken, setSelectedToken] = useState<AssetInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formCollapsed, setFormCollapsed] = useState(true);

  // 充值记录
  const [records, setRecords] = useState<RechargeRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
      const [walletsRes, assetsRes] = await Promise.all([
        walletService.getWallets(),
        assetService.getAssets(),
      ]);
      setWallets(walletsRes.wallets);
      setAssets(assetsRes.assets);
    } catch {
      showToast("加载数据失败");
    }
    setLoading(false);
  };

  /** 根据代币网络获取钱包在该网络上的链地址 */
  const getAssetAddress = (asset: AssetInfo): string => {
    if (!selectedWallet) return "";
    const account = walletAccounts.find((a) => a.network === asset.chain);
    return account?.address || "";
  };

  /** 地址截断显示 */
  const shortAddr = (addr: string): string => {
    if (!addr) return "";
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  };

  /** 选择钱包后加载该钱包的账户列表 */
  const handleSelectWallet = async (wallet: SimpleWallet) => {
    setSelectedWallet(wallet);
    setShowWalletPicker(false);
    try {
      const { accounts } = await accountService.getWalletAccounts(wallet.id);
      setWalletAccounts(accounts);
    } catch {
      setWalletAccounts([]);
    }
  };

  const loadRecords = async (page = 1, append = false) => {
    if (recordsLoading) return;
    setRecordsLoading(true);
    try {
      const res = await rechargeService.getRecharges({ page, limit: 20 });
      setRecords(append ? [...records, ...res.recharges] : res.recharges);
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
      await rechargeService.recharge({
        walletId: selectedWallet.id,
        tokenSymbol: selectedToken.symbol,
        network: selectedToken.chain,
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

  const renderRecord = ({ item }: { item: RechargeRecord }) => (
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
        <Text style={styles.recordWallet} numberOfLines={1}>
          {item.walletAlias} · {item.walletAddress.slice(0, 8)}...{item.walletAddress.slice(-4)}
        </Text>
        {item.memo ? <Text style={styles.recordMemo} numberOfLines={1}>{item.memo}</Text> : null}
        <Text style={styles.recordMeta}>
          {item.platform} · {item.deviceId.slice(0, 8)}... · {formatDate(item.createdAt)}
        </Text>
      </View>
    </View>
  );

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
                onPress={() => setShowWalletPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={selectedWallet ? styles.pickerBtnText : styles.pickerBtnPlaceholder}>
                  {selectedWallet ? `${selectedWallet.alias}` : "请选择钱包"}
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
      <Modal visible={showWalletPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowWalletPicker(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>选择钱包</Text>
            <FlatList
              data={wallets}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, selectedWallet?.id === item.id && styles.pickerItemActive]}
                  onPress={() => handleSelectWallet(item)}
                >
                  <View>
                    <Text style={styles.pickerItemName}>{item.alias}</Text>
                  </View>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 350 }}
            />
            <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setShowWalletPicker(false)}>
              <Text style={styles.pickerCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* 代币选择器 */}
      <Modal visible={showTokenPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowTokenPicker(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>选择代币</Text>
            <FlatList
              data={assets}
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

/** 格式化日期 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  recordBody: { gap: 2 },
  recordWallet: { fontSize: 13, color: "#6B7280" },
  recordMemo: { fontSize: 12, color: "#9CA3AF" },
  recordMeta: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
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
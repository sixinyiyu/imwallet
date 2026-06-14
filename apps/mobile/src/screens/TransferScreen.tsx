import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  FlatList,
  Share,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { transactionService } from "../services/transactionService";
import { contactService } from "../services/contactService";
import { configService } from "../services/configService";
import type { FeeConfig } from "../services/configService";
import { ContactIcon, ScanIcon, SuccessIcon, FailureIcon, ShareIcon, CopyIcon } from "../components/icons";
import type { Contact, TokenBalance } from "../types";

type Nav = NativeStackNavigationProp<RootStackParamList, "Transfer">;
type RouteType = RouteProp<RootStackParamList, "Transfer">;

function isValidAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

export default function TransferScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const { activeWallet, tokens } = useWalletStore();
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [showTokenPicker, setShowTokenPicker] = useState(false);

  // 初始化选中代币：优先匹配路由传入的 tokenSymbol
  useEffect(() => {
    if (tokens.length > 0 && !selectedToken) {
      const paramSymbol = route.params?.tokenSymbol;
      const matched = paramSymbol
        ? tokens.find((t) => t.symbol === paramSymbol)
        : null;
      setSelectedToken(matched || tokens[0]);
    }
  }, [tokens]);

  const selectedBalance = selectedToken ? selectedToken.balance : "0";
  const balance = parseFloat(selectedBalance) || 0;

  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [mode, setMode] = useState<"amount" | "value">("amount");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [result, setResult] = useState<{
    success: boolean;
    txHash?: string;
    error?: string;
    receivedAmount?: string;
    fee?: string;
  } | null>(null);
  const [feeConfig, setFeeConfig] = useState<FeeConfig>({
    feeRate: 0.005,
    feeMode: "DEDUCTED",
  });

  // 获取手续费配置
  useEffect(() => {
    configService.getFeeConfig().then(setFeeConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (route.params?.toAddress) setToAddress(route.params.toAddress);
  }, [route.params?.toAddress]);

  const openContactPicker = useCallback(async () => {
    try {
      const data = await contactService.getContacts();
      setContacts(data);
      setShowContactPicker(true);
    } catch { /* ignore */ }
  }, []);

  const selectContact = (c: Contact) => {
    setToAddress(c.address);
    setShowContactPicker(false);
  };

  const addressValid = useMemo(() => isValidAddress(toAddress), [toAddress]);
  const amountNum = parseFloat(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0;

  const feeRate = feeConfig.feeRate;
  const feeMode = feeConfig.feeMode;
  const fee = amountValid ? amountNum * feeRate : 0;

  // 根据 FEE_MODE 计算实际到账和发送方支付
  let actualReceive: number;
  let senderPays: number;
  let requiredBalance: number;

  if (feeMode === "EXTRA") {
    // EXTRA: A额外支付手续费 → A支付 amount+fee, B到账 amount
    actualReceive = amountValid ? amountNum : 0;
    senderPays = amountValid ? amountNum + fee : 0;
    requiredBalance = senderPays;
  } else {
    // DEDUCTED (默认): 从金额中扣 → A支付 amount, B到账 amount-fee
    actualReceive = amountValid ? amountNum - fee : 0;
    senderPays = amountValid ? amountNum : 0;
    requiredBalance = amountNum;
  }

  const insufficientBalance = amountNum > requiredBalance;
  const canProceed = addressValid && amountValid && !insufficientBalance && !!activeWallet;
  const addressStatus = useMemo(() => {
    if (!toAddress.trim()) return null;
    return addressValid ? "✓ 地址验证通过" : "✗ 无效的地址";
  }, [toAddress, addressValid]);
  const btnState = submitting ? "submitting" : !canProceed ? "disabled" : "enabled";

  // 手续费模式说明文字
  const feeModeDesc = feeMode === "EXTRA" ? "额外支付手续费" : "从转账金额中扣除";

  const handleNext = () => { if (!canProceed) return; setShowConfirm(true); };

  const handleConfirm = async () => {
    if (!activeWallet) return;
    setShowConfirm(false);
    setSubmitting(true);
    try {
      const tx = await transactionService.transfer({
        fromWalletId: activeWallet.id,
        toAddress: toAddress.trim(),
        amount,
        tokenId: selectedToken?.tokenId || "",
        memo: memo.trim() || "",
      });
      setResult({
        success: true,
        txHash: tx.txHash,
        receivedAmount: tx.receivedAmount,
        fee: tx.fee,
      });
    } catch (err: any) {
      const serverError = err.response?.data?.error || err.response?.data?.details?.[0]?.message || err.message;
      setResult({ success: false, error: serverError || "转账失败" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success / Fail result ──
  if (result) {
    navigation.setOptions({
      headerRight: result.success
        ? () => (
            <TouchableOpacity
              style={{ marginRight: 16 }}
              onPress={() =>
                Share.share({
                  message: `imwallet 转账 ${amount} USDT\nTX: ${result.txHash}`,
                })
              }
            >
              <ShareIcon size={20} color="#374151" />
            </TouchableOpacity>
          )
        : undefined,
    });

    const resultReceived = result.success && result.receivedAmount
      ? parseFloat(result.receivedAmount)
      : actualReceive;
    const resultFee = result.success && result.fee
      ? parseFloat(result.fee)
      : fee;

    return (
      <View style={z.resultContainer}>
        {result.success ? <SuccessIcon size={80} /> : <FailureIcon size={80} />}
        <Text style={z.resultTitle}>
          {result.success ? "转账成功" : "转账失败"}
        </Text>
        <View style={z.resultCard}>
          {result.success && result.txHash ? (
            <>
              <Text style={z.resultLabel}>交易哈希</Text>
              <Text style={z.resultHash} selectable>{result.txHash}</Text>
              <TouchableOpacity
                onPress={() => {
                  const C = require("expo-clipboard");
                  C.setStringAsync(result.txHash!);
                }}
              >
                <Text style={z.copyLink}>复制</Text>
              </TouchableOpacity>
              <View style={z.resultDivider} />
              <ResultRow label="收款地址" value={`${toAddress.slice(0, 8)}...${toAddress.slice(-6)}`} />
              <ResultRow label="实际到账" value={`${resultReceived.toFixed(6)} USDT`} />
              <ResultRow label="手续费" value={`${resultFee.toFixed(6)} USDT`} />
            </>
          ) : (
            <>
              <Text style={z.resultLabel}>错误原因</Text>
              <Text style={z.resultError}>{result.error || "未知错误"}</Text>
              <View style={z.resultDivider} />
              <Text style={z.resultLabel}>建议</Text>
              <Text style={z.suggestion}>1. 减少转账金额或降低转账数量</Text>
            </>
          )}
        </View>
        <View style={z.resultActions}>
          {!result.success && (
            <TouchableOpacity style={z.secondaryBtn} onPress={() => setResult(null)}>
              <Text style={z.secondaryBtnText}>返回修改</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={z.primaryBtn}
            onPress={() => {
              if (result.success) navigation.goBack();
              else { setResult(null); setSubmitting(false); }
            }}
          >
            <Text style={z.primaryBtnText}>
              {result.success ? "返回钱包" : "重试"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Contact Picker Modal */}
        <Modal visible={showContactPicker} transparent animationType="fade">
          <View style={z.modalOverlay}>
            <View style={z.modalCard}>
              <Text style={z.modalTitle}>选择联系人</Text>
              <FlatList
                data={contacts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={z.contactItem} onPress={() => selectContact(item)}>
                    <Text style={z.contactName}>{item.name}</Text>
                    <Text style={z.contactAddr}>
                      {item.address.slice(0, 12)}...{item.address.slice(-8)}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={{ color: "#9CA3AF", textAlign: "center", padding: 20 }}>
                    暂无联系人
                  </Text>
                }
              />
              <TouchableOpacity
                style={z.modalCancelBtn}
                onPress={() => setShowContactPicker(false)}
              >
                <Text style={z.modalCancelText}>取消</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={z.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={z.scroll} keyboardShouldPersistTaps="handled">

        {/* ── 收款地址 ── */}
        <View style={z.sectionLabel}>
          <Text style={z.sectionTitle}>收款地址</Text>
        </View>
        <View style={z.addressRow}>
          <View style={z.addressInputWrap}>
            <TextInput
              style={[z.addressInput, addressValid && z.inputValid]}
              placeholder="输入钱包地址"
              value={toAddress}
              onChangeText={setToAddress}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity style={z.contactBtn} onPress={openContactPicker}>
              <ContactIcon size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={z.scanBtn}
            onPress={() => navigation.navigate("Scan")}
          >
            <ScanIcon size={22} color="#374151" />
          </TouchableOpacity>
        </View>
        {addressStatus && (
          <Text style={[z.statusText, { color: addressValid ? "#10B981" : "#EF4444" }]}>
            {addressStatus}
          </Text>
        )}

        {/* ── 代币 ── */}
        <View style={z.sectionLabel}>
          <Text style={z.sectionTitle}>代币</Text>
        </View>
        <View style={z.tokenCard}>
          <View style={z.tokenHeader}>
            <TouchableOpacity style={z.tokenBadge} onPress={() => setShowTokenPicker(true)}>
              <Text style={z.tokenBadgeText}>{selectedToken?.symbol || "USDT"} ▼</Text>
            </TouchableOpacity>
            <View style={z.modeSwitch}>
              <TouchableOpacity
                style={[z.modeBtn, mode === "amount" && z.modeBtnActive]}
                onPress={() => setMode("amount")}
              >
                <Text style={[z.modeBtnText, mode === "amount" && z.modeBtnTextActive]}>
                  数量
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[z.modeBtn, mode === "value" && z.modeBtnActive]}
                onPress={() => setMode("value")}
              >
                <Text style={[z.modeBtnText, mode === "value" && z.modeBtnTextActive]}>
                  金额
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <TextInput
            style={z.tokenInput}
            placeholder="0.00"
            value={mode === "value" ? (amount ? "$" + amount : "") : amount}
            onChangeText={(t) => {
              const raw = mode === "value" ? t.replace(/^\$/, "") : t;
              const filtered = raw.replace(/[^0-9.]/g, "");
              const parts = filtered.split(".");
              if (parts.length > 2) return;
              setAmount(filtered);
            }}
            keyboardType="decimal-pad"
          />
          <View style={z.tokenInfoRow}>
            <Text style={z.infoLabel}>可用余额</Text>
            <Text style={z.infoValue}>{selectedBalance} {selectedToken?.symbol || "USDT"} (≈ ${balance.toFixed(2)})</Text>
          </View>
          <View style={z.tokenInfoRow}>
            <Text style={z.infoLabel}>手续费率</Text>
            <Text style={z.infoValue}>{feeRate * 100}%<Text style={z.feeModeDesc}>（{feeModeDesc}）</Text></Text>
          </View>
          <View style={z.tokenInfoRow}>
            <Text style={z.infoLabel}>预计到账</Text>
            <Text style={z.receiveValue}>≈ {actualReceive.toFixed(6)}</Text>
          </View>
        </View>

        {/* ── 备注 ── */}
        <View style={z.sectionLabel}>
          <Text style={z.sectionTitle}>备注</Text>
        </View>
        <TextInput
          style={z.input}
          placeholder="添加备注（可选）"
          value={memo}
          onChangeText={setMemo}
        />

        {/* ── 交易总览 ── */}
        <View style={z.sectionLabel}>
          <Text style={z.sectionTitle}>交易总览</Text>
        </View>
        <View style={z.summaryCard}>
          <SummaryRow label="转账金额" value={amountValid ? `${amountNum.toFixed(6)} USDT` : "—"} />
          <SummaryRow label="手续费" value={`${fee.toFixed(6)} USDT`} />
          <SummaryRow label="实际到账" value={amountValid ? `${actualReceive.toFixed(6)} USDT` : "—"} />
          <View style={z.summaryDivider} />
          <SummaryRow
            label={feeMode === "EXTRA" ? "总计（含手续费）" : "发送方支付"}
            value={amountValid ? `${senderPays.toFixed(6)} USDT` : "—"}
            bold
          />
          {insufficientBalance && <Text style={z.errorNote}>⚠ 余额不足</Text>}
        </View>

        {/* ── 下一步 ── */}
        <TouchableOpacity
          style={[
            z.nextBtn,
            btnState === "disabled" && z.nextBtnDisabled,
            btnState === "submitting" && z.nextBtnSubmitting,
          ]}
          onPress={handleNext}
          disabled={btnState !== "enabled"}
        >
          {btnState === "submitting" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={z.nextBtnText}>下一步</Text>
          )}
        </TouchableOpacity>
        <Text style={z.warning}>⚠️ 请确认收款地址和网络，转账不可撤销</Text>
      </ScrollView>

      {/* ── Contact Picker ── */}
      <Modal visible={showContactPicker} transparent animationType="fade">
        <View style={z.modalOverlay}>
          <View style={z.pickerCard}>
            <Text style={z.pickerTitle}>选择联系人</Text>
            <FlatList
              data={contacts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={z.contactItem} onPress={() => selectContact(item)}>
                  <View style={z.contactAvatar}>
                    <Text style={z.contactAvatarText}>👤</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={z.contactName}>{item.name}</Text>
                    <Text style={z.contactAddr}>
                      {item.address.slice(0, 14)}...{item.address.slice(-8)}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: "#9CA3AF", textAlign: "center", padding: 20 }}>
                  暂无联系人，请先在地址本添加
                </Text>
              }
              style={{ maxHeight: 300 }}
            />
            <TouchableOpacity
              style={z.pickerCancelBtn}
              onPress={() => setShowContactPicker(false)}
            >
              <Text style={z.modalCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 代币选择 ── */}
      <Modal visible={showTokenPicker} transparent animationType="fade">
        <View style={z.modalOverlay}>
          <View style={z.pickerCard}>
            <Text style={z.pickerTitle}>选择代币</Text>
            <FlatList
              data={tokens}
              keyExtractor={(item) => item.symbol}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[z.contactItem, item.symbol === selectedToken?.symbol && { backgroundColor: "#EFF6FF" }]}
                  onPress={() => {
                    setSelectedToken(item);
                    setShowTokenPicker(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={z.contactName}>{item.symbol} - {item.name}</Text>
                    <Text style={z.contactAddr}>余额: {item.balance}</Text>
                  </View>
                  {item.symbol === selectedToken?.symbol && (
                    <Text style={{ color: "#3B82F6", fontWeight: "600" }}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 300 }}
            />
            <TouchableOpacity
              style={z.pickerCancelBtn}
              onPress={() => setShowTokenPicker(false)}
            >
              <Text style={z.modalCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 确认弹窗 ── */}
      <Modal visible={showConfirm} transparent animationType="fade">
        <View style={z.modalOverlay}>
          <View style={z.modalCard}>
            <Text style={z.modalTitle}>⚠️ 确认转账</Text>
            <View style={z.modalDivider} />
            <Text style={z.modalLabel}>收款地址</Text>
            <Text style={z.modalAddress} selectable>
              {toAddress.length > 20
                ? `${toAddress.slice(0, 12)}...${toAddress.slice(-8)}`
                : toAddress}
            </Text>
            <View style={z.modalRows}>
              <SummaryRow label="转账金额" value={`${amountNum.toFixed(6)} USDT`} />
              <SummaryRow label="手续费" value={`${fee.toFixed(6)} USDT`} />
              <SummaryRow label="实际到账" value={`${actualReceive.toFixed(6)} USDT`} />
              <View style={z.summaryDivider} />
              <SummaryRow
                label={feeMode === "EXTRA" ? "总计（含手续费）" : "发送方支付"}
                value={`${senderPays.toFixed(6)} USDT`}
                bold
              />
            </View>
            <View style={z.modalDivider} />
            <View style={z.modalActions}>
              <TouchableOpacity style={z.modalCancelBtn} onPress={() => setShowConfirm(false)}>
                <Text style={z.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={z.modalConfirmBtn} onPress={handleConfirm}>
                <Text style={z.modalConfirmText}>确认转账</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={sr.row}>
      <Text style={[sr.label, bold && sr.bold]}>{label}</Text>
      <Text style={[sr.value, bold && sr.bold]}>{value}</Text>
    </View>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return <SummaryRow label={label} value={value} />;
}

const sr = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  label: { fontSize: 14, color: "#6B7280" },
  value: { fontSize: 14, color: "#1F2937", fontWeight: "500" },
  bold: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
});

const z = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: { marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#374151" },
  // Address
  addressRow: { flexDirection: "row", alignItems: "center" },
  addressInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
  },
  addressInput: { flex: 1, padding: 14, fontSize: 13, fontFamily: "monospace" },
  contactBtn: { paddingRight: 12 },
  scanBtn: {
    padding: 14,
    marginLeft: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  inputValid: { borderColor: "#10B981" },
  statusText: { fontSize: 13, marginTop: 6, marginLeft: 4 },
  // Token
  tokenCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tokenHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  tokenBadge: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  tokenBadgeText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  modeSwitch: { flexDirection: "row", gap: 4 },
  modeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  modeBtnActive: { backgroundColor: "#EFF6FF" },
  modeBtnText: { fontSize: 13, color: "#9CA3AF", fontWeight: "500" },
  modeBtnTextActive: { color: "#3B82F6", fontWeight: "600" },
  tokenInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#1F2937",
    marginBottom: 12,
  },
  tokenInfoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  infoLabel: { fontSize: 13, color: "#6B7280" },
  infoValue: { fontSize: 13, color: "#374151", fontWeight: "500" },
  feeModeDesc: { fontSize: 11, color: "#9CA3AF", fontWeight: "400" },
  receiveValue: { fontSize: 13, color: "#10B981", fontWeight: "600" },
  // Input
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 4,
  },
  // Summary
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  summaryDivider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 8 },
  errorNote: { color: "#EF4444", fontSize: 13, marginTop: 8 },
  // Button
  nextBtn: {
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  nextBtnDisabled: { backgroundColor: "#D1D5DB" },
  nextBtnSubmitting: { opacity: 0.7 },
  nextBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  warning: { fontSize: 13, color: "#F59E0B", textAlign: "center", marginTop: 20 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1F2937", textAlign: "center" },
  modalDivider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 14 },
  modalLabel: { fontSize: 13, color: "#6B7280", marginBottom: 4 },
  modalAddress: { fontSize: 13, color: "#1F2937", fontFamily: "monospace", marginBottom: 12 },
  modalRows: { backgroundColor: "#F9FAFB", borderRadius: 10, padding: 12 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  modalCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  modalCancelText: { color: "#6B7280", fontWeight: "600" },
  modalConfirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
    alignItems: "center",
  },
  modalConfirmText: { color: "#fff", fontWeight: "600" },
  // Contact Picker
  pickerCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 16,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  contactAvatarText: { fontSize: 16 },
  contactName: { fontSize: 15, fontWeight: "500", color: "#1F2937" },
  contactAddr: { fontSize: 12, color: "#9CA3AF", fontFamily: "monospace", marginTop: 2 },
  pickerCancelBtn: {
    padding: 14,
    marginTop: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    alignItems: "center",
  },
  // Result
  resultContainer: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    padding: 24,
    justifyContent: "center",
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 16,
    marginBottom: 20,
  },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    width: "100%",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  resultLabel: { fontSize: 13, color: "#6B7280", marginBottom: 4 },
  resultHash: { fontSize: 12, color: "#1F2937", fontFamily: "monospace", marginBottom: 8 },
  copyLink: { fontSize: 13, color: "#3B82F6", fontWeight: "500", marginBottom: 8 },
  resultDivider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 12 },
  resultError: { fontSize: 15, color: "#EF4444", fontWeight: "500", marginBottom: 8 },
  suggestion: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  resultActions: { flexDirection: "row", gap: 12, marginTop: 24, width: "100%" },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#6B7280", fontWeight: "600", fontSize: 16 },
});
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
} from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { transactionService } from "../services/transactionService";
import { localAddressService } from "../services/localAddressService";
import { configService } from "../services/configService";
import type { FeeConfig } from "../services/configService";
import { ContactIcon, ScanIcon, SuccessIcon, FailureIcon, ShareIcon, TronIcon, EthIcon, BtcIcon, USDTIcon } from "../components/icons";

/** 代币图标映射：根据 symbol 渲染对应代币 icon */
const TOKEN_ICONS: Record<string, React.FC<{ size?: number }>> = {
  TRX: TronIcon,
  USDT: USDTIcon,
  ETH: EthIcon,
  BTC: BtcIcon,
};

/** 根据代币 symbol 渲染图标，未知代币回退为 null */
function renderTokenIcon(symbol: string | undefined, size: number) {
  if (!symbol) return null;
  const Icon = TOKEN_ICONS[symbol];
  return Icon ? React.createElement(Icon, { size }) : null;
}
import type { AddressEntry, AssetBalance } from "../types";
import { detectNetwork, isValidAddressFormat } from "../utils/address";
import { useAlert } from "../hooks/useAlert";

/** 根据错误信息给出针对性建议 */
function getSuggestion(error?: string): string {
  if (!error) return "请稍后重试或联系客服";
  if (error.includes("不在系统内") || error.includes("RECIPIENT_NOT_IN_SYSTEM"))
    return "该地址不在系统内，当前已开启交易限制，\n仅支持向系统内账户转账";
  if (error.includes("余额不足") || error.includes("无该代币余额"))
    return "1. 先充值该代币后再转账\n2. 减少转账金额（含手续费）";
  if (error.includes("不能向自己转账"))
    return "请更换收款地址，不能使用自己的地址";
  if (error.includes("钱包不属于") || error.includes("设备未注册"))
    return "请退出重新登录，确保钱包与设备关联正常";
  if (error.includes("代币") || error.includes("Token"))
    return "请返回钱包首页刷新代币列表后重试";
  if (error.includes("校验失败") || error.includes("参数"))
    return "请检查收款地址和转账金额是否填写正确";
  if (error.includes("过期") || error.includes("重复请求"))
    return "请稍后重试";
  if (error.includes("服务器") || error.includes("内部错误"))
    return "服务暂时不可用，请稍后重试";
  return "1. 检查收款地址和网络是否正确\n2. 确认余额充足后重试";
}

type Nav = NativeStackNavigationProp<RootStackParamList, "Transfer">;
type RouteType = RouteProp<RootStackParamList, "Transfer">;

export default function TransferScreen() {
  const alert = useAlert();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const { activeWallet, assets, accounts } = useWalletStore();
  const [toAddress, setToAddress] = useState("");
  const [selectedToken, setSelectedToken] = useState<AssetBalance | null>(null);

  // 根据路由参数初始化选中的代币
  useEffect(() => {
    if (assets.length === 0) return;
    const paramSymbol = route.params?.tokenSymbol;
    const paramTokenId = route.params?.tokenId;
    if (paramTokenId) {
      const found = assets.find((a) => a.assetId === paramTokenId);
      if (found) setSelectedToken(found);
    } else if (paramSymbol) {
      const found = assets.find((a) => a.symbol === paramSymbol);
      if (found) setSelectedToken(found);
    }
  }, [assets, route.params?.tokenSymbol, route.params?.tokenId]);

  // 根据链上地址自动推断网络类型
  const detectedNetwork = useMemo(() => detectNetwork(toAddress), [toAddress]);

  // 跨网络检测：收款地址网络与选中代币网络不一致时提示
  const crossNetworkWarning = useMemo(() => {
    if (!detectedNetwork || !selectedToken) return null;
    if (selectedToken.chain !== detectedNetwork) {
      return `当前代币 ${selectedToken.symbol} 属于 ${selectedToken.chain} 网络，收款地址属于 ${detectedNetwork} 网络，暂不支持跨网络转账`;
    }
    return null;
  }, [detectedNetwork, selectedToken]);



  const selectedBalance = selectedToken ? selectedToken.balance : "0";
  const balance = parseFloat(selectedBalance) || 0;
  const tokenSymbol = selectedToken?.symbol || "USDT";

  // 根据选中的代币匹配付款账户
  const fromAccount = useMemo(() => {
    if (!selectedToken) return null;
    return accounts.find((a) => a.chain === selectedToken.chain) || null;
  }, [accounts, selectedToken]);

  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [mode, setMode] = useState<"amount" | "value">("amount");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contacts, setContacts] = useState<AddressEntry[]>([]);
  const [addressInContacts, setAddressInContacts] = useState(false);
  const [addingToContacts, setAddingToContacts] = useState(false);
  const [txRestrictWallet, setTxRestrictWallet] = useState(false);
  const [addressCheckResult, setAddressCheckResult] = useState<{ inSystem: boolean } | null>(null);
  const [checkingAddress, setCheckingAddress] = useState(false);

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
  const resultRef = useRef<View>(null);

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  // 获取手续费配置 + 交易限制配置
  useEffect(() => {
    Promise.all([
      configService.getFeeConfig().catch(() => null),
      configService.getTxRestrictWallet().catch(() => false),
    ]).then(([fee, restrict]) => {
      if (fee) setFeeConfig(fee);
      setTxRestrictWallet(restrict);
    });
  }, []);

  useEffect(() => {
    if (route.params?.toAddress) setToAddress(route.params.toAddress);
  }, [route.params?.toAddress]);

  const openContactPicker = useCallback(async () => {
    try {
      const data = await localAddressService.getAllContacts();
      setContacts(data);
      setShowContactPicker(true);
    } catch { /* ignore */ }
  }, []);

  const selectContact = (c: AddressEntry) => {
    setToAddress(c.address);
    setShowContactPicker(false);
  };

  const addressFormatValid = useMemo(() => isValidAddressFormat(toAddress), [toAddress]);

  // 地址格式正确时，调用后端接口检查地址是否在系统中 + 本地检查是否在地址本中
  useEffect(() => {
    if (!addressFormatValid || !toAddress.trim()) {
      setAddressCheckResult(null);
      setAddressInContacts(false);
      return;
    }
    let cancelled = false;
    setCheckingAddress(true);

    // 本地检查：地址是否已在地址本中（type=contact）
    const network = detectNetwork(toAddress.trim());
    const localCheck = network
      ? localAddressService.isContact(network, toAddress.trim())
      : Promise.resolve(false);

    // 服务端检查：地址是否在系统内
    const serverCheck = transactionService.checkAddress(toAddress.trim());

    Promise.all([serverCheck, localCheck]).then(([result, inContacts]) => {
      if (cancelled) return;
      setAddressCheckResult(result);
      setAddressInContacts(inContacts);
    }).catch(() => {
      if (cancelled) return;
      setAddressCheckResult(null);
      setAddressInContacts(false);
    }).finally(() => {
      if (!cancelled) setCheckingAddress(false);
    });
    return () => { cancelled = true; };
  }, [addressFormatValid, toAddress]);

  // 地址有效 = 格式合法（链上地址格式正确即可转账，无需收款方在系统中存在）
  // 但如果开启了交易限制，收款地址必须在系统中存在
  const addressValid = addressFormatValid && (!txRestrictWallet || (addressCheckResult?.inSystem ?? false));
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
  const canProceed = addressValid && amountValid && !insufficientBalance && !!activeWallet && !crossNetworkWarning;

  /** 点击"添加到地址本"快捷链接 */
  const handleAddToContacts = async () => {
    if (!addressValid || addingToContacts) return;
    setAddingToContacts(true);
    try {
      const contactName = toAddress.trim().slice(0, 10);
      await localAddressService.upsertAddress({
        chain: detectedNetwork || "Tron",
        address: toAddress.trim(),
        name: contactName,
        type: "contact",
        status: "unverified",
      });
      setAddressInContacts(true);
      setAddressCheckResult((prev) => prev ? { ...prev, inSystem: true } : prev);
      showToast("已添加到地址本");
    } catch (err: any) {
      alert("提示", "添加到地址本失败: " + (err.message || "未知错误"));
    } finally {
      setAddingToContacts(false);
    }
  };
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
        tokenSymbol: selectedToken?.symbol || "USDT",
        network: selectedToken?.chain || "Tron",
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
      setResult({ success: false, error: serverError || "转账失败，请稍后重试" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    try {
      const uri = await captureRef(resultRef, {
        format: "png",
        quality: 1,
      });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "分享转账结果",
        });
      } else {
        const { Share } = require("react-native");
        await Share.share({ message: `AquaD 转账 ${amount} ${tokenSymbol}` });
      }
    } catch (err: any) {
      alert("分享失败", err.message || "请尝试截图后手动分享");
    }
  };

  // ── Success / Fail result ──
  if (result) {
    navigation.setOptions({
      headerRight: result.success
        ? () => (
            <TouchableOpacity
              style={{ marginRight: 16 }}
              onPress={handleShare}
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
      <View style={z.resultContainer} ref={resultRef} collapsable={false}>
        {result.success ? <SuccessIcon size={80} /> : <FailureIcon size={80} />}
        <Text style={z.resultTitle}>
          {result.success ? "转账成功" : "转账失败"}
        </Text>
        <View style={z.resultCard}>
          {result.success ? (
            <>
              <ResultRow label="付款地址" value={fromAccount ? `${fromAccount.address.slice(0, 8)}...${fromAccount.address.slice(-6)}` : "—"} />
              <ResultRow label="收款地址" value={`${toAddress.slice(0, 8)}...${toAddress.slice(-6)}`} />
              <ResultRow label="实际到账" value={`${resultReceived.toFixed(6)} ${tokenSymbol}`} />
              <ResultRow label="手续费" value={`${resultFee.toFixed(6)} ${tokenSymbol}`} />
            </>
          ) : (
            <>
              <Text style={z.resultLabel}>错误原因</Text>
              <Text style={z.resultError}>{result.error || "未知错误"}</Text>
              <View style={z.resultDivider} />
              <Text style={z.resultLabel}>建议</Text>
              <Text style={z.suggestion}>{getSuggestion(result.error)}</Text>
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

      </View>
    );
  }

  return (
    <React.Fragment>
    <KeyboardAvoidingView
      style={z.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={z.scroll} keyboardShouldPersistTaps="handled">

        {/* ── 付款账号 ── */}
        <View style={z.sectionLabel}>
          <Text style={z.sectionTitle}>付款账号</Text>
        </View>
        <View style={z.fromAccountCard}>
          {fromAccount ? (
            <>
              <View style={z.fromAccountIconWrap}>
                {renderTokenIcon(selectedToken?.symbol, 20)}
              </View>
              <Text style={z.fromAccountAddress} numberOfLines={1} ellipsizeMode="middle">
                {fromAccount.address}
              </Text>
            </>
          ) : (
            <Text style={z.fromAccountEmpty}>未选择代币</Text>
          )}
        </View>

        {/* ── 收款地址 ── */}
        <View style={z.sectionLabel}>
          <Text style={z.sectionTitle}>收款地址</Text>
        </View>
        <View style={z.addressRow}>
          <View style={z.addressInputWrap}>
            <TextInput
              style={[z.addressInput, addressValid && z.inputValid]}
              placeholder="请输入链上地址"
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
        {/* 地址校验状态行 */}
        {toAddress.trim() && (
          <View style={z.statusRow}>
            {!addressFormatValid ? (
              <Text style={[z.statusText, { color: "#EF4444" }]}>✗ 无效的地址格式</Text>
            ) : checkingAddress ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <ActivityIndicator size="small" color="#9CA3AF" />
                <Text style={[z.statusText, { color: "#9CA3AF" }]}>正在校验地址...</Text>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" }}>
                  <Text style={[z.statusText, { color: "#10B981" }]}>✓ 地址格式正确</Text>
                  {txRestrictWallet && addressCheckResult && (
                    addressCheckResult.inSystem ? (
                      <Text style={[z.statusText, { color: "#10B981" }]}>✓ 系统内地址</Text>
                    ) : (
                      <Text style={[z.statusText, { color: "#EF4444" }]}>⚠ 该地址不在系统内，已开启交易限制，不支持向系统外地址转账</Text>
                    )
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {!addressInContacts && !addingToContacts && (
                    <TouchableOpacity onPress={handleAddToContacts}>
                      <Text style={z.addToContactLinkText}>＋ 添加到地址本</Text>
                    </TouchableOpacity>
                  )}
                  {addingToContacts && (
                    <ActivityIndicator size="small" color="#287220" />
                  )}
                  {addressInContacts && (
                    <Text style={z.addedToContactText}>✓ 已添加到地址本</Text>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        {/* 跨网络提示 */}
        {crossNetworkWarning && (
          <View style={z.crossNetworkWarn}>
            <Text style={z.crossNetworkWarnText}>⚠ {crossNetworkWarning}</Text>
          </View>
        )}

        {/* ── 代币 ── */}
        <View style={z.sectionLabel}>
          <Text style={z.sectionTitle}>代币</Text>
        </View>
        <View style={z.tokenCard}>
          <View style={z.tokenHeader}>
            <View style={{ paddingLeft: 14 }}>{renderTokenIcon(selectedToken?.symbol, 20)}</View>
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
          <SummaryRow label="转账金额" value={amountValid ? `${amountNum.toFixed(6)} ${tokenSymbol}` : "—"} />
          <SummaryRow label="手续费" value={`${fee.toFixed(6)} ${tokenSymbol}`} />
          <SummaryRow label="实际到账" value={amountValid ? `${actualReceive.toFixed(6)} ${tokenSymbol}` : "—"} />
          <View style={z.summaryDivider} />
          <SummaryRow
            label={feeMode === "EXTRA" ? "总计（含手续费）" : "发送方支付"}
            value={amountValid ? `${senderPays.toFixed(6)} ${tokenSymbol}` : "—"}
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
              keyExtractor={(item) => `${item.chain}_${item.address}`}
              renderItem={({ item }) => (
                <TouchableOpacity style={[z.contactItem, item.address.toLowerCase() === toAddress.trim().toLowerCase() && z.contactItemActive]} onPress={() => selectContact(item)}>
                  <View style={z.contactAvatar}>
                    <Text style={z.contactAvatarText}>👤</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={z.contactName}>{item.name}</Text>
                      <View style={{ backgroundColor: "#DBEAFE", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, color: "#3B82F6", fontWeight: "500" }}>{item.chain}</Text>
                      </View>
                    </View>
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
              <SummaryRow label="转账金额" value={`${amountNum.toFixed(6)} ${tokenSymbol}`} />
              <SummaryRow label="手续费" value={`${fee.toFixed(6)} ${tokenSymbol}`} />
              <SummaryRow label="实际到账" value={`${actualReceive.toFixed(6)} ${tokenSymbol}`} />
              <View style={z.summaryDivider} />
              <SummaryRow
                label={feeMode === "EXTRA" ? "总计（含手续费）" : "发送方支付"}
                value={`${senderPays.toFixed(6)} ${tokenSymbol}`}
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

      {/* Toast */}
      {toastVisible && (
        <View style={z.toastWrap} pointerEvents="none">
          <View style={z.toast}>
            <Text style={z.toastText}>{toastMsg}</Text>
          </View>
        </View>
      )}
    </React.Fragment>
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
  // From account
  fromAccountCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  fromAccountIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  fromAccountAddress: {
    flex: 1,
    fontSize: 14,
    color: "#1F2937",
    fontFamily: "monospace",
  },
  fromAccountEmpty: {
    fontSize: 14,
    color: "#9CA3AF",
  },
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
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginLeft: 4 },
  statusText: { fontSize: 13 },
  addToContactLinkText: { fontSize: 13, color: "#287220", fontWeight: "500" },
  addedToContactText: { fontSize: 13, color: "#10B981", fontWeight: "500" },
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
    backgroundColor: "#287220",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  tokenBadgeText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  modeSwitch: { flexDirection: "row", gap: 4 },
  modeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  modeBtnActive: { backgroundColor: "#E8F5E9" },
  modeBtnText: { fontSize: 13, color: "#9CA3AF", fontWeight: "500" },
  modeBtnTextActive: { color: "#287220", fontWeight: "600" },
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
    backgroundColor: "#287220",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  nextBtnDisabled: { backgroundColor: "#D1D5DB" },
  nextBtnSubmitting: { opacity: 0.7 },
  nextBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  warning: { fontSize: 13, color: "#F59E0B", textAlign: "center", marginTop: 20 },
  crossNetworkWarn: {
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  crossNetworkWarnText: { fontSize: 13, color: "#92400E", lineHeight: 18 },
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
    backgroundColor: "#287220",
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
  contactItemActive: {
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E8F5E9",
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
  resultDivider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 12 },
  resultError: { fontSize: 15, color: "#EF4444", fontWeight: "500", marginBottom: 8 },
  suggestion: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  resultActions: { flexDirection: "row", gap: 12, marginTop: 24, width: "100%" },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#287220",
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
  // Toast
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
});
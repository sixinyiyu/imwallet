import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import type { Transaction } from "../types";
import { transactionService } from "../services/transactionService";
import { localAddressService } from "../services/localAddressService";
import { useWalletStore } from "../stores/walletStore";
import { ShareIcon, CopyIcon } from "../components/icons";
import { TradeDetailSkeleton } from "../components/Skeleton";
import { useAlert } from "../hooks/useAlert";
import SuccessIcon from "../components/icons/SuccessIcon";
import FailureIcon from "../components/icons/FailureIcon";
import PendingIcon from "../components/icons/PendingIcon";
import { USDTIcon, TronIcon, EthIcon, BtcIcon } from "../components/icons";
import type { AddressEntry } from "../types";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { formatFullTime } from "../utils/date";

type Route = RouteProp<RootStackParamList, "TradeDetail">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const TOKEN_ICONS: Record<string, React.FC<{ size?: number }>> = {
  TRX: TronIcon,
  USDT: USDTIcon,
  ETH: EthIcon,
  BTC: BtcIcon,
};

function renderTokenIcon(symbol: string, size: number) {
  const Icon = TOKEN_ICONS[symbol];
  return Icon ? <Icon size={size} /> : null;
}



function shortenAddress(addr: string): string {
  return `${addr.slice(0, 12)}...${addr.slice(-8)}`;
}

export default function TradeDetailScreen() {
  const alert = useAlert();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { accounts } = useWalletStore();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contactMap, setContactMap] = useState<Map<string, AddressEntry>>(new Map());
  const detailRef = useRef<ScrollView>(null);

  // 当前钱包的所有地址集合（用于判断“我的地址”）
  const myAddresses = useMemo(() => new Set(accounts.map((a) => a.address)), [accounts]);

  // 加载本地地址本，构建 address → AddressEntry 映射
  useEffect(() => {
    localAddressService.getAllContacts().then((contacts) => {
      const map = new Map<string, AddressEntry>();
      for (const c of contacts) {
        map.set(c.address, c);
      }
      setContactMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!route.params?.tradeId) return;
    setLoading(true);
    transactionService
      .getDetail(route.params.tradeId)
      .then(setTx)
      .catch((e) => setError(e.message || "加载失败"))
      .finally(() => setLoading(false));
  }, [route.params?.tradeId]);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  const handleCopyAddress = async (address: string) => {
    try {
      const Clipboard = require("expo-clipboard");
      await Clipboard.setStringAsync(address);
      showToast("地址已复制");
    } catch {
      showToast("复制失败");
    }
  };

  const handleShare = async () => {
    try {
      const uri = await captureRef(detailRef, {
        format: "png",
        quality: 1,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "分享交易详情",
        });
      } else {
        const { Share } = require("react-native");
        await Share.share({ message: `AquaD 交易详情\n金额: ${tx?.amount} ${tx?.tokenSymbol}\n状态: ${tx?.status}` });
      }
    } catch (err: any) {
      alert("分享失败", err.message || "请尝试截图后手动分享");
    }
  };

  // 设置导航栏右侧分享按钮
  useEffect(() => {
    if (tx) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            style={{ marginRight: 16 }}
            onPress={handleShare}
          >
            <ShareIcon size={20} color="#374151" />
          </TouchableOpacity>
        ),
      });
    }
  }, [tx, navigation]);

  if (loading) {
    return <TradeDetailSkeleton />;
  }

  if (error || !tx) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || "交易不存在"}</Text>
      </View>
    );
  }

  const feeNum = parseFloat(tx.fee) || 0;
  const amountNum = parseFloat(tx.amount) || 0;

  // 判断当前用户是否是发送方或接收方（用当前钱包的所有地址判断）
  const isSender = myAddresses.has(tx.fromAddress);
  const isReceiver = myAddresses.has(tx.toAddress);

  // 获取地址的友好名称：我的地址→“我”，匹配到联系人→备注/名称，未匹配→null
  const getDisplayName = (address: string, isMe: boolean): string | null => {
    if (isMe) return "我";
    const contact = contactMap.get(address);
    if (contact) return contact.memo || contact.name;
    return null;
  };
  const fromName = getDisplayName(tx.fromAddress, isSender);
  const toName = getDisplayName(tx.toAddress, isReceiver);

  // 根据 FEE_MODE 计算实际到账和总计
  const isFeeDeducted = tx.feeMode === "DEDUCTED";
  const receivedAmount = parseFloat(tx.receivedAmount) || (isFeeDeducted ? amountNum - feeNum : amountNum);
  const senderTotal = isFeeDeducted ? amountNum : amountNum + feeNum;

  return (
    <View style={styles.container}>
    <ScrollView ref={detailRef} contentContainerStyle={styles.scroll} collapsable={false}>
      {/* 状态区 */}
      <View style={styles.statusSection}>
        {tx.status === "CONFIRMED" && <SuccessIcon size={72} />}
        {tx.status === "PENDING" && <PendingIcon size={72} />}
        {tx.status === "FAILED" && <FailureIcon size={72} />}
        <Text style={styles.statusLabel}>
          {tx.status === "CONFIRMED" ? "成功" : tx.status === "PENDING" ? "处理中" : "失败"}
        </Text>
        <Text style={styles.statusTime}>{formatFullTime(tx.createdAt)}</Text>
      </View>

      {/* 概览 */}
      <Text style={styles.sectionTitle}>概览</Text>
      <View style={styles.card}>
        {/* 发送方 - icon根据当前用户高亮 */}
        <View style={styles.partyBlock}>
          <View style={[styles.partyIconWrap, isSender && styles.partyIconHighlight]}>
            <Text style={[styles.partyIconEmoji, isSender && styles.partyIconEmojiHighlight]}>👤</Text>
          </View>
          <View style={styles.partyTextWrap}>
            {fromName ? <Text style={styles.partyName}>{fromName}</Text> : null}
            <View style={styles.partyAddrRow}>
              <Text style={styles.partyAddr}>{shortenAddress(tx.fromAddress)}</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={() => handleCopyAddress(tx.fromAddress)} activeOpacity={0.6}>
                <CopyIcon size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* 金额行 */}
        <View style={styles.flowAmountRow}>
          <Text style={styles.flowLabel}>发送</Text>
          <Text style={styles.flowAmount}>{tx.amount} {tx.tokenSymbol}</Text>
        </View>

        <View style={styles.divider} />

        {/* 接收方 - icon根据当前用户高亮 */}
        <View style={styles.partyBlock}>
          <View style={[styles.partyIconWrap, isReceiver && styles.partyIconHighlight]}>
            <Text style={[styles.partyIconEmoji, isReceiver && styles.partyIconEmojiHighlight]}>👤</Text>
          </View>
          <View style={styles.partyTextWrap}>
            {toName ? <Text style={styles.partyName}>{toName}</Text> : null}
            <View style={styles.partyAddrRow}>
              <Text style={styles.partyAddr}>{shortenAddress(tx.toAddress)}</Text>
              <TouchableOpacity style={styles.copyBtn} onPress={() => handleCopyAddress(tx.toAddress)} activeOpacity={0.6}>
                <CopyIcon size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* 代币转移 */}
      <Text style={styles.sectionTitle}>代币转移</Text>
      <View style={styles.card}>
        <TokenTransferRow
          address={tx.fromAddress}
          alias={fromName}
          token={tx.tokenSymbol}
          amount={`-${tx.amount}`}
          isOut
          isCurrentUser={isSender}
        />
        <View style={styles.divider} />
        <TokenTransferRow
          address={tx.toAddress}
          alias={toName}
          token={tx.tokenSymbol}
          amount={`+${receivedAmount.toFixed(6)}`}
          isOut={false}
          isCurrentUser={isReceiver}
        />
      </View>

      {/* 交易详情 */}
      <Text style={styles.sectionTitle}>交易详情</Text>
      <View style={styles.card}>
        <InfoRow label="网络" value="Private Chain" />
        <View style={styles.divider} />
        <InfoRow label="转账金额" value={`${tx.amount} ${tx.tokenSymbol}`} />
        <View style={styles.divider} />
        <InfoRow label="手续费" value={`${tx.fee} ${tx.tokenSymbol}`} />
        {isFeeDeducted ? (
          <>
            <View style={styles.divider} />
            <InfoRow label="实际到账" value={`${receivedAmount.toFixed(6)} ${tx.tokenSymbol}`} />
          </>
        ) : null}
        <View style={styles.cardDivider} />
        <InfoRow
          label={isFeeDeducted ? "发送方支付" : "总计（含手续费）"}
          value={`${senderTotal.toFixed(6)} ${tx.tokenSymbol}`}
          bold
        />
        {tx.memo ? (
          <>
            <View style={styles.divider} />
            <InfoRow label="备注" value={tx.memo} />
          </>
        ) : null}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>

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

/** 代币转移行 - 上下布局 */
function TokenTransferRow({
  address,
  alias,
  token,
  amount,
  isOut,
  isCurrentUser,
}: {
  address: string;
  alias: string | null;
  token: string;
  amount: string;
  isOut: boolean;
  isCurrentUser: boolean;
}) {
  return (
    <View style={ttr.row}>
      {/* 上方：地址 + 用户名，左对齐 */}
      <View style={ttr.topRow}>
        <Text style={[ttr.addr, isCurrentUser && ttr.addrHighlight]} numberOfLines={1}>
          {shortenAddress(address)}
        </Text>
        {alias ? (
          <Text style={[ttr.alias, isCurrentUser && ttr.aliasHighlight]}>{alias}</Text>
        ) : null}
      </View>
      {/* 下方：左侧代币icon+名称，右侧金额 */}
      <View style={ttr.bottomRow}>
        <View style={ttr.tokenLeft}>
          {renderTokenIcon(token, 18)}
          <Text style={ttr.tokenName}>{token}</Text>
        </View>
        <Text style={[ttr.tokenAmt, isOut ? ttr.out : ttr.in]}>
          {amount}
        </Text>
      </View>
    </View>
  );
}

function InfoRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <View style={ir.valueWrap}>
        <Text
          style={[ir.value, bold && ir.bold]}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const HIGHLIGHT_BG = "#DBEAFE"; // 浅蓝色背景
const HIGHLIGHT_TEXT = "#3B82F6"; // 浅蓝色文字

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scroll: { padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 15, color: "#EF4444" },

  // Status
  statusSection: { alignItems: "center", paddingVertical: 24 },
  statusLabel: { fontSize: 20, fontWeight: "700", color: "#1F2937", marginTop: 8 },
  statusTime: { fontSize: 14, color: "#6B7280", marginTop: 8 },

  // Sections
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#374151", marginTop: 16, marginBottom: 8 },

  // Card
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#E5E7EB" },
  divider: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 10 },
  cardDivider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 10 },

  // Party - 左右两栏居中布局
  partyBlock: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  partyIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center",
    marginRight: 12,
  },
  partyIconHighlight: {
    backgroundColor: HIGHLIGHT_BG,
  },
  partyIconEmoji: { fontSize: 20 },
  partyIconEmojiHighlight: { color: HIGHLIGHT_TEXT },
  partyTextWrap: { flex: 1 },
  partyName: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  partyAddrRow: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 6 },
  partyAddr: { fontSize: 12, color: "#9CA3AF", fontFamily: "monospace" },
  copyBtn: { padding: 2, flexShrink: 0 },

  // Flow amount
  flowAmountRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  flowLabel: { fontSize: 14, color: "#6B7280" },
  flowAmount: { fontSize: 16, fontWeight: "700", color: "#EF4444" },

  // Toast
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
});

// TokenTransferRow styles - 上下布局
const ttr = StyleSheet.create({
  row: { paddingVertical: 4 },
  // 上方：地址 + 用户名，左对齐
  topRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  addr: { fontSize: 12, color: "#6B7280", fontFamily: "monospace", marginRight: 8 },
  addrHighlight: { color: HIGHLIGHT_TEXT },
  alias: { fontSize: 13, color: "#374151", fontWeight: "500" },
  aliasHighlight: { color: HIGHLIGHT_TEXT },
  // 下方：左侧代币icon+名称，右侧金额
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tokenLeft: { flexDirection: "row", alignItems: "center" },
  tokenName: { fontSize: 13, color: "#374151", fontWeight: "500", marginLeft: 6 },
  tokenAmt: { fontSize: 15, fontWeight: "600" },
  out: { color: "#EF4444" },
  in: { color: "#10B981" },
});

// InfoRow styles
const ir = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  label: { fontSize: 14, color: "#6B7280", marginRight: 12 },
  valueWrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  value: { fontSize: 14, color: "#1F2937", fontWeight: "500", textAlign: "right" },
  bold: { fontSize: 16, fontWeight: "700" },
});
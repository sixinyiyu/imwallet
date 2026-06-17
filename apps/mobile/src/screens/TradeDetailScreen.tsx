import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import type { Transaction } from "../types";
import { transactionService } from "../services/transactionService";
import { useWalletStore } from "../stores/walletStore";
import { ShareIcon } from "../components/icons";
import SuccessIcon from "../components/icons/SuccessIcon";
import FailureIcon from "../components/icons/FailureIcon";
import PendingIcon from "../components/icons/PendingIcon";
import USDTIcon from "../components/icons/USDTIcon";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

type Route = RouteProp<RootStackParamList, "TradeDetail">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

function formatFullTime(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const min = d.getMinutes();
  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
  const w = weekDays[d.getDay()];
  const period = h < 12 ? "上午" : h < 18 ? "下午" : "晚上";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${y}年${m}月${day}日 星期${w} ${period}${h12}点${min}分`;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 12)}...${addr.slice(-8)}`;
}

export default function TradeDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { activeWallet } = useWalletStore();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const detailRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!route.params?.tradeId) return;
    setLoading(true);
    transactionService
      .getDetail(route.params.tradeId)
      .then(setTx)
      .catch((e) => setError(e.message || "加载失败"))
      .finally(() => setLoading(false));
  }, [route.params?.tradeId]);

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
        await Share.share({ message: `imwallet 交易详情\n金额: ${tx?.amount} USDT\n状态: ${tx?.status}` });
      }
    } catch (err: any) {
      Alert.alert("分享失败", err.message || "请尝试截图后手动分享");
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
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
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
  const total = amountNum + feeNum;
  // 优先级：联系人名 > 钱包别名
  const fromName = tx.fromContactName || tx.fromWallet.alias;
  const toName = tx.toContactName || tx.toWallet.alias;

  // 判断当前用户是否是发送方或接收方
  const currentAddress = activeWallet?.address || "";
  const isSender = tx.fromWallet.address === currentAddress;
  const isReceiver = tx.toWallet.address === currentAddress;

  // 根据 FEE_MODE 计算实际到账和总计
  const isFeeDeducted = tx.feeMode === "DEDUCTED";
  const receivedAmount = parseFloat(tx.receivedAmount) || (isFeeDeducted ? amountNum - feeNum : amountNum);
  const senderTotal = isFeeDeducted ? amountNum : amountNum + feeNum;

  return (
    <ScrollView ref={detailRef} style={styles.container} contentContainerStyle={styles.scroll} collapsable={false}>
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
            <Text style={styles.partyName}>{fromName}</Text>
            <Text style={styles.partyAddr}>{shortenAddress(tx.fromWallet.address)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* 金额行 */}
        <View style={styles.flowAmountRow}>
          <Text style={styles.flowLabel}>发送</Text>
          <Text style={styles.flowAmount}>{tx.amount} USDT</Text>
        </View>

        <View style={styles.divider} />

        {/* 接收方 - icon根据当前用户高亮 */}
        <View style={styles.partyBlock}>
          <View style={[styles.partyIconWrap, isReceiver && styles.partyIconHighlight]}>
            <Text style={[styles.partyIconEmoji, isReceiver && styles.partyIconEmojiHighlight]}>👤</Text>
          </View>
          <View style={styles.partyTextWrap}>
            <Text style={styles.partyName}>{toName}</Text>
            <Text style={styles.partyAddr}>{shortenAddress(tx.toWallet.address)}</Text>
          </View>
        </View>
      </View>

      {/* 代币转移 */}
      <Text style={styles.sectionTitle}>代币转移</Text>
      <View style={styles.card}>
        <TokenTransferRow
          address={tx.fromWallet.address}
          alias={tx.fromWallet.alias}
          token="USDT"
          amount={`-${tx.amount}`}
          isOut
          isCurrentUser={isSender}
        />
        <View style={styles.divider} />
        <TokenTransferRow
          address={tx.toWallet.address}
          alias={toName}
          token="USDT"
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
        <InfoRow label="转账金额" value={`${tx.amount} USDT`} />
        <View style={styles.divider} />
        <InfoRow label="手续费" value={`${tx.fee} USDT`} />
        {isFeeDeducted ? (
          <>
            <View style={styles.divider} />
            <InfoRow label="实际到账" value={`${receivedAmount.toFixed(6)} USDT`} />
          </>
        ) : null}
        <View style={styles.cardDivider} />
        <InfoRow
          label={isFeeDeducted ? "发送方支付" : "总计（含手续费）"}
          value={`${senderTotal.toFixed(6)} USDT`}
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
  alias: string;
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
        <Text style={[ttr.alias, isCurrentUser && ttr.aliasHighlight]}>{alias}</Text>
      </View>
      {/* 下方：左侧代币icon+名称，右侧金额 */}
      <View style={ttr.bottomRow}>
        <View style={ttr.tokenLeft}>
          <USDTIcon size={18} />
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
  monospace,
  bold,
  copyable,
}: {
  label: string;
  value: string;
  monospace?: boolean;
  bold?: boolean;
  copyable?: boolean;
}) {
  const nav = useNavigation<Nav>();
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <View style={ir.valueWrap}>
        <Text
          style={[ir.value, monospace && ir.mono, bold && ir.bold]}
          numberOfLines={2}
        >
          {value}
        </Text>
        {copyable && (
          <TouchableOpacity
            onPress={() => {
              const C = require("expo-clipboard");
              C.setStringAsync(value);
            }}
          >
            <Text style={ir.copyBtn}>复制</Text>
          </TouchableOpacity>
        )}
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
  partyAddr: { fontSize: 12, color: "#9CA3AF", fontFamily: "monospace", marginTop: 2 },

  // Flow amount
  flowAmountRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  flowLabel: { fontSize: 14, color: "#6B7280" },
  flowAmount: { fontSize: 16, fontWeight: "700", color: "#EF4444" },
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
  mono: { fontFamily: "monospace", fontSize: 11 },
  bold: { fontSize: 16, fontWeight: "700" },
  copyBtn: { fontSize: 12, color: "#3B82F6", fontWeight: "500", marginLeft: 8 },
});
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { Transaction } from "../types";

interface Props {
  transaction: Transaction;
  currentAddress: string;
  onPress?: (tx: Transaction) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TransactionItem({ transaction, currentAddress, onPress }: Props) {
  const isReceive = transaction.toWallet.address === currentAddress;

  const label = isReceive ? "收到" : "发送";
  const prefix = isReceive ? "+" : "-";
  const color = isReceive ? "#10B981" : "#EF4444";
  const bgColor = isReceive ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)";

  // 对方钱包
  const counterpartyWallet = isReceive ? transaction.fromWallet : transaction.toWallet;
  const counterpartyContactName = isReceive ? transaction.fromContactName : transaction.toContactName;

  // 优先联系人名称 → 钱包别名 → 地址简写
  const displayName =
    counterpartyContactName ||
    counterpartyWallet.alias ||
    `${counterpartyWallet.address.slice(0, 8)}...${counterpartyWallet.address.slice(-6)}`;

  const subLabel = counterpartyContactName
    ? counterpartyWallet.alias || `${counterpartyWallet.address.slice(0, 8)}...${counterpartyWallet.address.slice(-6)}`
    : `${counterpartyWallet.address.slice(0, 8)}...${counterpartyWallet.address.slice(-6)}`;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress?.(transaction)}
      activeOpacity={onPress ? 0.6 : 1}
    >
      <View style={[styles.iconBox, { backgroundColor: bgColor }]}>
        <Text style={[styles.icon, { color }]}>
          {isReceive ? "↓" : "↑"}
        </Text>
      </View>
      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={styles.label}>{label}</Text>
          {counterpartyContactName ? (
            <View style={styles.contactBadge}>
              <Text style={styles.contactBadgeText}>👤 {counterpartyContactName}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.address} numberOfLines={1}>
          {isReceive ? "来自 " : "去向 "}{displayName}
        </Text>
        {counterpartyContactName ? (
          <Text style={styles.subAddress} numberOfLines={1}>
            {subLabel}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, { color }]}>
          {prefix}{transaction.amount} USDT
        </Text>
        <Text style={styles.time}>
          {formatTime(transaction.createdAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  icon: { fontSize: 18, fontWeight: "700" },
  info: { flex: 1 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  contactBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  contactBadgeText: { fontSize: 11, color: "#3B82F6", fontWeight: "500" },
  address: { fontSize: 13, color: "#9CA3AF", marginTop: 3 },
  subAddress: { fontSize: 11, color: "#D1D5DB", marginTop: 1 },
  right: { alignItems: "flex-end" },
  amount: { fontSize: 15, fontWeight: "600" },
  time: { fontSize: 12, color: "#D1D5DB", marginTop: 3 },
});

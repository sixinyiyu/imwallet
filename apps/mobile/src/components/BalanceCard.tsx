import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useFiatStore } from "../stores/fiatStore";

interface Props {
  totalBalanceUsd: string;
  address: string;
  onCopy: () => void;
}

export default function BalanceCard({ totalBalanceUsd, address, onCopy }: Props) {
  const { currency } = useFiatStore();
  const shortAddr = address
    ? `${address.slice(0, 10)}...${address.slice(-8)}`
    : "—";

  return (
    <View style={styles.card}>
      <Text style={styles.balanceLabel}>总余额 ({currency.code})</Text>
      <Text style={styles.balanceValue} adjustsFontSizeToFit numberOfLines={1}>
        {currency.symbol} {totalBalanceUsd ? parseFloat(totalBalanceUsd).toFixed(2) : "0.00"}
      </Text>
      <View style={styles.addressRow}>
        <Text style={styles.addressLabel}>钱包地址</Text>
        <Text style={styles.addressText} adjustsFontSizeToFit numberOfLines={1}>
          {shortAddr}
        </Text>
        <TouchableOpacity onPress={onCopy} style={styles.copyBtn}>
          <Text style={styles.copyText}>复制</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  balanceLabel: { fontSize: 14, color: "#6B7280", marginBottom: 8 },
  balanceValue: { fontSize: 28, fontWeight: "700", color: "#1F2937", marginBottom: 16 },
  addressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addressLabel: { fontSize: 13, color: "#6B7280" },
  addressText: { fontSize: 13, color: "#374151", fontFamily: "monospace", flex: 1, marginLeft: 8 },
  copyBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: "#EFF6FF" },
  copyText: { color: "#3B82F6", fontSize: 13, fontWeight: "500" },
});

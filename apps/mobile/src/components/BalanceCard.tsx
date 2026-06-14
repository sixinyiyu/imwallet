import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props {
  totalBalanceCny: string;
  address: string;
  onCopy: () => void;
}

export default function BalanceCard({ totalBalanceCny, address, onCopy }: Props) {
  const shortAddr = address
    ? `${address.slice(0, 10)}...${address.slice(-8)}`
    : "—";

  return (
    <View style={styles.card}>
      <Text style={styles.balanceLabel}>总余额 (CNY)</Text>
      <Text style={styles.balanceValue} adjustsFontSizeToFit numberOfLines={1}>
        ¥ {totalBalanceCny ? parseFloat(totalBalanceCny).toFixed(2) : "0.00"}
      </Text>
      <View style={styles.addressRow}>
        <Text style={styles.addressLabel}>钱包地址</Text>
        <Text style={styles.addressText} adjustsFontSizeToFit numberOfLines={1}>
          {shortAddr}
        </Text>
        <TouchableOpacity style={styles.copyButton} onPress={onCopy}>
          <Text style={styles.copyText}>复制</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    padding: 24,
    backgroundColor: "#3B82F6",
    borderRadius: 16,
    elevation: 3,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  balanceLabel: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 4 },
  balanceValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 20,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    padding: 12,
    borderRadius: 10,
  },
  addressLabel: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginRight: 8 },
  addressText: {
    flex: 1,
    fontSize: 12,
    color: "#fff",
    fontFamily: "monospace",
  },
  copyButton: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  copyText: { fontSize: 12, color: "#fff", fontWeight: "600" },
});
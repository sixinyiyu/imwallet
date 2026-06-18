import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFiatStore } from "../stores/fiatStore";
import { EyeIcon, EyeOffIcon } from "../components/icons";

interface Props {
  totalBalanceUsd: string;
  address: string;
  onCopy: () => void;
}

export default function BalanceCard({ totalBalanceUsd, address, onCopy }: Props) {
  const { currency } = useFiatStore();
  const [balanceVisible, setBalanceVisible] = useState(true);

  const shortAddr = address
    ? `${address.slice(0, 10)}...${address.slice(-8)}`
    : "—";

  const displayBalance = balanceVisible
    ? `${currency.symbol} ${totalBalanceUsd ? parseFloat(totalBalanceUsd).toFixed(2) : "0.00"}`
    : "***";

  return (
    <LinearGradient
      colors={["#1B5E20", "#2E7D32", "#43A047"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.card}
    >
      <View style={styles.balanceHeader}>
        <Text style={styles.balanceLabel}>总余额 (USDT)</Text>
        <TouchableOpacity
          onPress={() => setBalanceVisible(!balanceVisible)}
          activeOpacity={0.6}
          style={styles.eyeBtn}
        >
          {balanceVisible
            ? <EyeIcon size={20} color="rgba(255,255,255,0.7)" />
            : <EyeOffIcon size={20} color="rgba(255,255,255,0.7)" />
          }
        </TouchableOpacity>
      </View>
      <Text style={styles.balanceValue} adjustsFontSizeToFit numberOfLines={1}>
        {displayBalance}
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
  },
  balanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  balanceLabel: { fontSize: 14, color: "rgba(255,255,255,0.7)" },
  eyeBtn: { padding: 4 },
  balanceValue: { fontSize: 28, fontWeight: "700", color: "#FFFFFF", marginBottom: 16 },
  addressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addressLabel: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  addressText: { fontSize: 13, color: "#FFFFFF", fontFamily: "monospace", flex: 1, marginLeft: 8 },
  copyBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.2)" },
  copyText: { color: "#FFFFFF", fontSize: 13, fontWeight: "500" },
});

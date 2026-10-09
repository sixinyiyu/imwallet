import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFiatStore } from "../stores/fiatStore";
import { EyeIcon, EyeOffIcon } from "../components/icons";

interface Props {
  totalBalanceUsd: string;
  /** 数据是否为离线缓存（服务端不可用或已过期），为 true 时展示过期提示 */
  stale?: boolean;
}

export default function BalanceCard({ totalBalanceUsd, stale = false }: Props) {
  const { currency } = useFiatStore();
  const [balanceVisible, setBalanceVisible] = useState(true);

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
      {stale && (
        <Text style={styles.staleHint}>离线数据 · 可能已过期，请检查网络</Text>
      )}
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
  balanceValue: { fontSize: 28, fontWeight: "700", color: "#FFFFFF" },
  staleHint: {
    marginTop: 6,
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
  },
});

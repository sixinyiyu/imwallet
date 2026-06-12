import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { TokenBalance } from "../types";
import { USDTIcon } from "./icons";
import TronIcon from "./icons/TronIcon";

interface Props {
  tokens: TokenBalance[];
  onTokenPress: (token: TokenBalance) => void;
}

export default function TokenList({ tokens, onTokenPress }: Props) {
  if (tokens.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>暂无代币</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {tokens.map((token, index) => (
        <TouchableOpacity
          key={token.tokenId || token.symbol || index}
          style={[
            styles.item,
            index < tokens.length - 1 && styles.itemBorder,
          ]}
          onPress={() => onTokenPress(token)}
        >
          <View style={styles.iconContainer}>
            {token.symbol === "TRX" ? (
              <TronIcon size={32} />
            ) : (
              <USDTIcon size={32} />
            )}
          </View>
          <View style={styles.info}>
            <Text style={styles.symbol}>{token.symbol}</Text>
            <Text style={styles.name}>{token.name}</Text>
          </View>
          <View style={styles.balance}>
            <Text style={styles.balanceText}>{token.balance}</Text>
            <Text style={styles.cnyValue}>≈ ¥{token.cnyValue}</Text>
            <Text style={styles.usdValue}>≈ ${token.usdValue}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  info: { flex: 1 },
  symbol: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  name: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  balance: { alignItems: "flex-end" },
  balanceText: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  cnyValue: { fontSize: 12, color: "#1F2937", marginTop: 2, fontWeight: "500" },
  usdValue: { fontSize: 12, color: "#9CA3AF", marginTop: 1 },
  empty: { alignItems: "center", padding: 32 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
});

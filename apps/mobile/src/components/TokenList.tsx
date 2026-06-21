import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import type { AssetBalance } from "../types";
import { USDTIcon } from "./icons";
import TronIcon from "./icons/TronIcon";
import { useFiatStore } from "../stores/fiatStore";
import EmptyState from "./EmptyState";

interface Props {
  assets: AssetBalance[];
  onAssetPress: (asset: AssetBalance) => void;
  loading?: boolean;
}

/** 骨架屏占位行 */
function SkeletonRow() {
  const opacity = React.useRef(new Animated.Value(0.3)).current;

  React.useEffect(() => {
    const animate = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animate.start();
    return () => animate.stop();
  }, [opacity]);

  return (
    <View style={styles.item}>
      <Animated.View style={[styles.skeletonIcon, { opacity }]} />
      <View style={styles.info}>
        <Animated.View style={[styles.skeletonLine, { width: 60, height: 16, opacity }]} />
        <Animated.View style={[styles.skeletonLine, { width: 80, height: 12, marginTop: 4, opacity }]} />
      </View>
      <View style={styles.balance}>
        <Animated.View style={[styles.skeletonLine, { width: 70, height: 16, opacity }]} />
        <Animated.View style={[styles.skeletonLine, { width: 50, height: 12, marginTop: 4, opacity }]} />
      </View>
    </View>
  );
}

export default function TokenList({ assets, onAssetPress, loading }: Props) {
  const { currency } = useFiatStore();
  const safeAssets = assets || [];

  // 加载中：显示骨架屏
  if (loading && safeAssets.length === 0) {
    return (
      <View style={styles.container}>
        {[0, 1, 2].map((i) => (
          <View key={i}>
            <SkeletonRow />
            {i < 2 && <View style={styles.itemBorder} />}
          </View>
        ))}
      </View>
    );
  }

  if (safeAssets.length === 0) {
    return (
      <EmptyState message="暂无代币" />
    );
  }

  const getDisplayValue = (asset: AssetBalance) => {
    return asset.usdValue;
  };

  return (
    <View style={styles.container}>
      {safeAssets.map((asset, index) => (
        <TouchableOpacity
          key={asset.assetId || asset.symbol || index}
          style={[
            styles.item,
            index < safeAssets.length - 1 && styles.itemBorder,
          ]}
          onPress={() => onAssetPress(asset)}
        >
          <View style={styles.iconContainer}>
            {asset.symbol === "TRX" ? (
              <TronIcon size={32} />
            ) : (
              <USDTIcon size={32} />
            )}
          </View>
          <View style={styles.info}>
            <Text style={styles.symbol}>{asset.symbol}</Text>
            <Text style={styles.name}>{asset.name}</Text>
          </View>
          <View style={styles.balance}>
            <Text style={styles.balanceText}>{asset.balance}</Text>
            <Text style={styles.fiatValue}>
              ≈ {currency.symbol}{getDisplayValue(asset)}
            </Text>
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
  fiatValue: { fontSize: 12, color: "#1F2937", marginTop: 2, fontWeight: "500" },
  // Skeleton
  skeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E5E7EB",
    marginRight: 12,
  },
  skeletonLine: {
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
  },
  empty: { alignItems: "center", padding: 32 },
  emptyImage: { width: 120, height: 120, marginBottom: 12 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
});
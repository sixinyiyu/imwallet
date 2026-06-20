import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import EmptyState from "../components/EmptyState";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { TransactionCard } from "../screens/RecordsScreen";
import { assetService } from "../services/assetService";
import { USDTIcon, TransferIcon, ReceiveIcon, RecordsIcon, TronIcon } from "../components/icons";
import type { Transaction } from "../types";

type Route = RouteProp<RootStackParamList, "TokenDetail">;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TokenDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { tokenSymbol } = route.params;
  const { activeWallet, assets } = useWalletStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  const asset = assets.find((a) => a.symbol === tokenSymbol);

  useEffect(() => {
    navigation.setOptions({ title: asset?.name ?? tokenSymbol });
  }, [asset, tokenSymbol]);

  useEffect(() => {
    if (activeWallet) {
      loadTransactions();
    }
  }, [activeWallet]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await assetService.getTransactions(activeWallet!.id, 1, 5, tokenSymbol);
      setTransactions(data.transactions);
    } catch {
      // silent
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Token Header */}
      <View style={styles.tokenHeader}>
        <View style={styles.iconCircle}>
          {asset?.symbol === "TRX" ? <TronIcon size={48} /> : <USDTIcon size={48} />}
        </View>
        <Text style={styles.balance}>
          {asset?.balance ?? "0.0000"} {tokenSymbol}
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate("Transfer", { tokenSymbol, tokenId: asset?.assetId })}
        >
          <TransferIcon size={24} color="#3B82F6" />
          <Text style={styles.actionLabel}>转账</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate("Receive", { tokenSymbol, tokenId: asset?.assetId })}
        >
          <ReceiveIcon size={24} color="#10B981" />
          <Text style={styles.actionLabel}>收款</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate("Records", { tokenSymbol })}
        >
          <RecordsIcon size={24} color="#F59E0B" />
          <Text style={styles.actionLabel}>记录</Text>
        </TouchableOpacity>
      </View>

      {/* Asset Info - 去掉了合约地址 */}
      <Text style={styles.sectionTitle}>资产信息</Text>
      <View style={styles.infoCard}>
        <InfoRow label="总余额" value={`${asset?.balance ?? "0"} ${tokenSymbol}`} />
        <View style={styles.infoDivider} />
        <InfoRow label="估值(USD)" value={`$${asset?.usdValue ?? "0.00"}`} />
        <View style={styles.infoDivider} />
        <InfoRow label="代币精度" value="6" />
        <View style={styles.infoDivider} />
        <InfoRow label="所属网络" value="Private Chain" />
      </View>

      {/* Transaction History - 使用卡片样式 */}
      <Text style={styles.sectionTitle}>交易记录</Text>
      {loading ? (
        <ActivityIndicator style={{ padding: 20 }} color="#3B82F6" />
      ) : transactions.length > 0 ? (
        <View style={styles.txSection}>
          {transactions.map((tx) => (
            <TransactionCard
              key={tx.id}
              transaction={tx}
              currentAddress={activeWallet?.address ?? ""}
              onPress={(t) => navigation.navigate("TradeDetail", { tradeId: t.id })}
            />
          ))}
          <TouchableOpacity
            style={styles.viewAll}
            onPress={() => navigation.navigate("Records", { tokenSymbol })}
          >
            <Text style={styles.viewAllText}>查看全部交易记录 ›</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <EmptyState message="暂无交易记录" />
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value}>{value}</Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  label: { fontSize: 14, color: "#6B7280" },
  value: { fontSize: 14, fontWeight: "500", color: "#1F2937" },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  tokenHeader: { alignItems: "center", paddingVertical: 24 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  balance: { fontSize: 28, fontWeight: "700", color: "#1F2937", marginTop: 12 },

  actions: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  actionBtn: { flex: 1, alignItems: "center" },
  actionLabel: { fontSize: 14, color: "#374151", fontWeight: "500" },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 8,
  },
  infoCard: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  infoDivider: { height: 1, backgroundColor: "#F3F4F6" },
  txSection: { marginHorizontal: 16 },
  viewAll: { padding: 14, alignItems: "center" },
  viewAllText: { fontSize: 14, color: "#3B82F6", fontWeight: "500" },
});
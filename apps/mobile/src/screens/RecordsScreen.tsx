import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useWalletStore } from "../stores/walletStore";
import { transactionService, type TransactionFilter } from "../services/transactionService";
import type { Transaction } from "../types";
import { SearchIcon, USDTIcon } from "../components/icons";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RecordsRoute = RouteProp<RootStackParamList, "Records">;

type TypeFilter = "all" | "send" | "receive";
type TimeFilter = "today" | "7d" | "30d" | "90d";

const TYPE_OPTIONS: { label: string; value: TypeFilter }[] = [
  { label: "全部", value: "all" },
  { label: "发送", value: "send" },
  { label: "收到", value: "receive" },
];

const TIME_OPTIONS: { label: string; value: TimeFilter }[] = [
  { label: "今日", value: "today" },
  { label: "近7天", value: "7d" },
  { label: "近30天", value: "30d" },
  { label: "近90天", value: "90d" },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export default function RecordsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RecordsRoute>();
  const { activeWallet } = useWalletStore();
  // 支持路由传入 walletId（管理员查看其他用户交易记录时使用）
  const currentWalletId = route.params?.walletId || activeWallet?.id;
  const currentWalletAddress = activeWallet?.address || "";
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // 筛选状态
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter | null>(null);
  const [searchText, setSearchText] = useState("");

  // 设置导航栏右侧搜索 icon
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={{ marginRight: 16 }}
          onPress={() => setFilterExpanded((prev) => !prev)}
        >
          <SearchIcon size={22} color={filterExpanded ? "#3B82F6" : "#374151"} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, filterExpanded]);

  const loadTransactions = useCallback(
    async (p: number, append = false) => {
      if (!currentWalletId) return;
      try {
        const filter: TransactionFilter = {
          walletId: currentWalletId,
          page: p,
          limit: 20,
          type: typeFilter,
          timeRange: timeFilter || undefined,
          search: searchText.trim() || undefined,
        };
        const data = await transactionService.getTransactions(filter);
        setTransactions((prev) => (append ? [...prev, ...data.transactions] : data.transactions));
        setTotal(data.total);
        setPage(p);
      } catch {
        // silent
      }
    },
    [activeWallet, typeFilter, timeFilter, searchText]
  );

  // 筛选条件变化时重新加载
  useEffect(() => {
    if (!currentWalletId) return;
    setLoading(true);
    loadTransactions(1).finally(() => setLoading(false));
  }, [typeFilter, timeFilter, searchText, currentWalletId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions(1);
    setRefreshing(false);
  };

  const handleLoadMore = () => {
    if (transactions.length < total && !loadingMore) {
      setLoadingMore(true);
      loadTransactions(page + 1, true).finally(() => setLoadingMore(false));
    }
  };

  if (!currentWalletId) {
    return (
      <View style={styles.centerEmpty}>
        <Text style={styles.emptyIcon}>👛</Text>
        <Text style={styles.emptyText}>请先在钱包页面选择一个钱包</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── 可折叠筛选面板 ── */}
      {filterExpanded && (
        <View style={styles.filterPanel}>
          {/* 交易类型 */}
          <Text style={styles.filterLabel}>交易类型</Text>
          <View style={styles.filterRow}>
            {TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.filterChip,
                  typeFilter === opt.value && styles.filterChipActive,
                ]}
                onPress={() => setTypeFilter(opt.value)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    typeFilter === opt.value && styles.filterChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 时间范围 */}
          <Text style={styles.filterLabel}>时间范围</Text>
          <View style={styles.filterRow}>
            {TIME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.filterChip,
                  timeFilter === opt.value && styles.filterChipActive,
                ]}
                onPress={() => setTimeFilter(timeFilter === opt.value ? null : opt.value)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    timeFilter === opt.value && styles.filterChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 搜索 */}
          <Text style={styles.filterLabel}>搜索</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="输入地址或名称搜索"
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchText.trim() && (
              <TouchableOpacity
                style={styles.searchClear}
                onPress={() => setSearchText("")}
              >
                <Text style={styles.searchClearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── 交易列表 ── */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TransactionCard
              transaction={item}
              currentAddress={currentWalletAddress}
              onPress={(tx) => navigation.navigate("TradeDetail", { tradeId: tx.id })}
            />
          )}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.centerEmpty}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>暂无交易记录</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ padding: 20 }} color="#9CA3AF" />
            ) : transactions.length >= total && transactions.length > 0 ? (
              <Text style={styles.endHint}>— 已加载全部 —</Text>
            ) : null
          }
          contentContainerStyle={
            transactions.length === 0 ? styles.emptyList : styles.listContent
          }
        />
      )}
    </View>
  );
}

/** 圆角卡片式交易记录 */
export function TransactionCard({
  transaction,
  currentAddress,
  onPress,
}: {
  transaction: Transaction;
  currentAddress: string;
  onPress?: (tx: Transaction) => void;
}) {
  const isReceive = transaction.toWallet.address === currentAddress;
  const label = isReceive ? "收到" : "发送";
  const prefix = isReceive ? "+" : "-";
  const amountColor = isReceive ? "#10B981" : "#EF4444";
  const iconBgColor = isReceive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)";

  // 对方信息
  const counterpartyWallet = isReceive ? transaction.fromWallet : transaction.toWallet;
  const counterpartyContactName = isReceive ? transaction.fromContactName : transaction.toContactName;
  // 优先级：联系人名 > 钱包别名 > 缩略地址
  const displayName = counterpartyContactName || counterpartyWallet.alias || shortenAddress(counterpartyWallet.address);

  const feeNum = parseFloat(transaction.fee) || 0;

  return (
    <TouchableOpacity
      style={card.container}
      onPress={() => onPress?.(transaction)}
      activeOpacity={0.7}
    >
      {/* 第一行：方向 + 金额 */}
      <View style={card.topRow}>
        <View style={card.labelWrap}>
          <View style={[card.iconBox, { backgroundColor: iconBgColor }]}>
            <Text style={[card.iconText, { color: amountColor }]}>
              {isReceive ? "↓" : "↑"}
            </Text>
          </View>
          <Text style={card.label}>{label}</Text>
        </View>
        <Text style={[card.amount, { color: amountColor }]}>
          {prefix}{transaction.amount} USDT
        </Text>
      </View>

      {/* 第二行：对方信息 */}
      <View style={card.middleRow}>
        <Text style={card.directionSymbol}>{isReceive ? "←" : "→"}</Text>
        <Text style={card.counterpartyAddr} numberOfLines={1}>
          {shortenAddress(counterpartyWallet.address)}
        </Text>
        <Text style={card.counterpartyName}>{displayName}</Text>
      </View>

      {/* 第三行：时间 + 手续费 */}
      <View style={card.bottomRow}>
        <Text style={card.time}>{formatTime(transaction.createdAt)}</Text>
        {feeNum > 0 && (
          <Text style={card.fee}>手续费 {transaction.fee} USDT</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },

  // ── 筛选面板 ──
  filterPanel: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  filterLabel: { fontSize: 13, color: "#6B7280", fontWeight: "500", marginTop: 12, marginBottom: 6 },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  filterChipActive: { backgroundColor: "#3B82F6" },
  filterChipText: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  filterChipTextActive: { color: "#fff" },
  searchRow: { flexDirection: "row", alignItems: "center" },
  searchInput: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: "#1F2937",
  },
  searchClear: { padding: 10 },
  searchClearText: { fontSize: 16, color: "#9CA3AF" },

  // ── 列表 ──
  centerLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerEmpty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  emptyList: { flexGrow: 1 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: "#9CA3AF", textAlign: "center" },
  endHint: { textAlign: "center", paddingVertical: 20, fontSize: 13, color: "#D1D5DB" },
});

// 卡片样式
const card = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  // 第一行
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  labelWrap: { flexDirection: "row", alignItems: "center" },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  iconText: { fontSize: 14, fontWeight: "700" },
  label: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  amount: { fontSize: 16, fontWeight: "700" },
  // 第二行
  middleRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  directionSymbol: { fontSize: 13, color: "#9CA3AF", marginRight: 4 },
  counterpartyAddr: { fontSize: 12, color: "#6B7280", fontFamily: "monospace", marginRight: 8 },
  counterpartyName: { fontSize: 13, color: "#374151", fontWeight: "500" },
  // 第三行
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  time: { fontSize: 12, color: "#9CA3AF" },
  fee: { fontSize: 12, color: "#9CA3AF" },
});
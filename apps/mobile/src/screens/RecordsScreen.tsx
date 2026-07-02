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
import { TransactionListSkeleton } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import { transactionService, type TransactionFilter } from "../services/transactionService";
import { localAddressService } from "../services/localAddressService";
import type { Transaction, AddressEntry } from "../types";
import { SearchIcon, TOKEN_ICONS, renderTokenIcon } from "../components/icons";
import { formatTime } from "../utils/date";
import { configService, type FeeConfig } from "../services/configService";

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




export default function RecordsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RecordsRoute>();
  const { activeWallet, activeAccount } = useWalletStore();
  // 支持路由传入 walletId（管理员查看其他用户交易记录时使用）和 tokenSymbol（从代币详情页进入时过滤当前代币）
  const currentWalletId = route.params?.walletId || activeWallet?.id;
  const currentTokenSymbol = route.params?.tokenSymbol;
  const currentWalletAddress = activeAccount?.address || "";
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

  // 手续费配置（用于计算实到金额）
  const [feeConfig, setFeeConfig] = useState<FeeConfig>({ feeRate: 0.005, feeMode: "DEDUCTED" });

  // 设置导航栏右侧搜索 icon + 加载手续费配置
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
    configService.getFeeConfig().then((cfg) => {
      if (cfg) setFeeConfig(cfg);
    }).catch(() => {});
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
          tokenSymbol: currentTokenSymbol || undefined,
        };
        const data = await transactionService.getTransactions(filter);

        // 服务端不存储联系人名，客户端用本地地址本匹配对方地址
        const allContacts = await localAddressService.getAllContacts();
        const contactMap = new Map<string, AddressEntry>();
        for (const c of allContacts) {
          contactMap.set(c.address, c);
        }
        const enriched = data.transactions.map((tx) => {
          const fromContact = contactMap.get(tx.fromAddress);
          const toContact = contactMap.get(tx.toAddress);
          return {
            ...tx,
            fromContactName: fromContact ? (fromContact.memo || fromContact.name) : "",
            toContactName: toContact ? (toContact.memo || toContact.name) : "",
          };
        });

        setTransactions((prev) => (append ? [...prev, ...enriched] : enriched));
        setTotal(data.total);
        setPage(p);
      } catch {
        // silent
      }
    },
    [activeWallet, typeFilter, timeFilter, searchText, currentTokenSymbol]
  );

  // 筛选条件变化时重新加载
  useEffect(() => {
    if (!currentWalletId) return;
    setLoading(true);
    loadTransactions(1).finally(() => setLoading(false));
  }, [typeFilter, timeFilter, searchText, currentWalletId, currentTokenSymbol]);

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
          <Text style={styles.filterLabel}>交易类型 <Text style={styles.filterHint}>（暂不支持筛选）</Text></Text>
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
          <Text style={styles.filterLabel}>时间范围 <Text style={styles.filterHint}>（暂不支持筛选）</Text></Text>
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
        <TransactionListSkeleton count={5} />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TransactionCard
              transaction={item}
              currentAddress={currentWalletAddress}
              feeMode={feeConfig.feeMode}
              onPress={(tx) => navigation.navigate("TradeDetail", { tradeId: tx.id })}
            />
          )}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState message="暂无交易记录" />
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

/** 圆角卡片式交易记录
 * 发送方(A)：显示金额 + 手续费 + 实到金额
 * 接收方(B)：只显示到账金额，不显示手续费
 * DEDUCTED 模式：A转100，手续费0.5，B到账99.5
 *   - A 看到: -100 USDT, 手续费 0.5, 实到 99.5
 *   - B 看到: +99.5 USDT (无手续费信息)
 */
export function TransactionCard({
  transaction,
  currentAddress,
  feeMode = "DEDUCTED",
  onPress,
}: {
  transaction: Transaction;
  currentAddress: string;
  feeMode?: string;
  onPress?: (tx: Transaction) => void;
}) {
  const isReceive = transaction.toAddress === currentAddress;
  const label = isReceive ? "收到" : "发送";
  const amountColor = isReceive ? "#10B981" : "#EF4444";
  const iconBgColor = isReceive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)";

  // 对方信息
  const counterpartyContactName = isReceive ? transaction.fromContactName : transaction.toContactName;
  const counterpartyAddress = isReceive ? transaction.fromAddress : transaction.toAddress;

  const feeNum = parseFloat(transaction.fee) || 0;
  const amountNum = parseFloat(transaction.amount) || 0;

  // 计算实到金额：DEDUCTED 模式 = amount - fee, EXTRA 模式 = amount
  const receivedNum = feeMode === "EXTRA" ? amountNum : amountNum - feeNum;

  // 接收方看到的金额是实到金额，发送方看到的是转账金额
  const displayAmount = isReceive ? receivedNum : amountNum;
  const prefix = isReceive ? "+" : "-";

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
          {prefix}{displayAmount.toFixed(6)} {transaction.tokenSymbol}
        </Text>
      </View>

      {/* 第二行：方向箭头 + 代币icon + 对方地址 + 联系人名称 */}
      <View style={card.middleRow}>
        <Text style={card.directionSymbol}>{isReceive ? "←" : "→"}</Text>
        <View style={card.tokenIconWrap}>
          {renderTokenIcon(transaction.tokenSymbol, 14)}
        </View>
        <Text style={card.counterpartyAddr} numberOfLines={1}>
          {counterpartyAddress.slice(0, 8)}...{counterpartyAddress.slice(-6)}
        </Text>
        {counterpartyContactName ? (
          <Text style={card.counterpartyName}>{counterpartyContactName}</Text>
        ) : null}
      </View>

      {/* 第三行：时间 + 手续费（仅发送方显示） */}
      <View style={card.bottomRow}>
        <Text style={card.time}>{formatTime(transaction.createdAt)}</Text>
        {/* 接收方(B)不显示手续费，发送方(A)显示手续费和实到金额 */}
        {!isReceive && feeNum > 0 && (
          <Text style={card.fee}>手续费 {feeNum.toFixed(6)} {transaction.tokenSymbol} · 实到 {receivedNum.toFixed(6)}</Text>
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
  filterHint: { fontSize: 11, color: "#9CA3AF", fontWeight: "400" },
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
  tokenIconWrap: { marginRight: 6, alignItems: "center", justifyContent: "center" },
  counterpartyAddr: { fontSize: 12, color: "#6B7280", fontFamily: "monospace", marginRight: 8, flexShrink: 1 },
  counterpartyName: { fontSize: 13, color: "#374151", fontWeight: "500" },
  // 第三行
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  time: { fontSize: 12, color: "#9CA3AF" },
  fee: { fontSize: 12, color: "#9CA3AF" },
});
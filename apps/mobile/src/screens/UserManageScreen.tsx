import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { adminService } from "../services/authService";
import { UserIcon } from "../components/icons";

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface WalletInfo {
  id: string;
  alias: string;
  address: string;
  tokenBalances: { id: string; symbol: string; name: string; balance: string }[];
  isActive: boolean;
}

interface UserItem {
  id: string;
  username: string;
  status: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  wallets: WalletInfo[];
}

const BUILT_IN_USERS = ["admin", "damotou"];

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  ACTIVE: { label: "正常", color: "#059669", bgColor: "#D1FAE5" },
};

export default function UserManageScreen() {
  const navigation = useNavigation<Nav>();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsers = async () => {
    try {
      const result = await adminService.getAllUsers();
      const filtered = result.users.filter(
        (u: UserItem) => !BUILT_IN_USERS.includes(u.username)
      );
      setUsers(filtered);
    } catch (err: any) {
      Alert.alert("错误", err.message || "获取用户列表失败");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  };

  const handleDeactivate = (userId: string, username: string) => {
    Alert.alert("停用用户", `确定要停用用户 "${username}" 吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "停用",
        style: "destructive",
        onPress: async () => {
          try {
            await adminService.deactivateUser(userId);
            Alert.alert("成功", `用户 "${username}" 已停用`);
            fetchUsers();
          } catch (err: any) {
            Alert.alert("错误", err?.response?.data?.error || err.message || "操作失败");
          }
        },
      },
    ]);
  };

  const handleDelete = (userId: string, username: string) => {
    Alert.alert("删除用户", `确定要删除用户 "${username}" 吗？此操作不可恢复。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            await adminService.softDeleteUser(userId);
            Alert.alert("成功", `用户 "${username}" 已删除`);
            fetchUsers();
          } catch (err: any) {
            Alert.alert("错误", err?.response?.data?.error || err.message || "操作失败");
          }
        },
      },
    ]);
  };

  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    if (num >= 1000000) return (num / 1000000).toFixed(2) + "M";
    if (num >= 1000) return (num / 1000).toFixed(2) + "K";
    return num.toFixed(2);
  };

  const renderItem = ({ item }: { item: UserItem }) => {
    const statusCfg = STATUS_CONFIG[item.status] || { label: item.status, color: "#6B7280", bgColor: "#F3F4F6" };
    const activeWallet = item.wallets.find((w) => w.isActive) || item.wallets[0];
    const totalBalance = item.wallets.reduce((sum, w) => {
      return sum + w.tokenBalances.reduce((s, tb) => s + parseFloat(tb.balance), 0);
    }, 0);

    return (
      <View style={styles.card}>
        {/* 上半部分：用户名 + 状态标签 + 操作按钮 */}
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <UserIcon size={20} color="#374151" />
            <Text style={styles.username}>{item.username}</Text>
            <View style={[styles.statusTag, { backgroundColor: statusCfg.bgColor }]}>
              <Text style={[styles.statusTagText, { color: statusCfg.color }]}>
                {statusCfg.label}
              </Text>
            </View>
          </View>
          <View style={styles.cardTopRight}>
            {item.status === "ACTIVE" && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.deactivateBtn]}
                onPress={() => handleDeactivate(item.id, item.username)}
              >
                <Text style={styles.deactivateBtnText}>停用</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={() => handleDelete(item.id, item.username)}
            >
              <Text style={styles.deleteBtnText}>删除</Text>
            </TouchableOpacity>
          </View>        </View>

        {/* 下半部分：钱包余额 */}
        {item.wallets.length > 0 ? (
          <View style={styles.cardBottom}>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>钱包余额</Text>
              <Text style={styles.balanceValue}>{formatBalance(totalBalance.toString())}</Text>
            </View>
            {item.wallets.length > 1 && (
              <Text style={styles.walletCount}>
                共 {item.wallets.length} 个钱包
              </Text>
            )}
            {activeWallet && (
              <TouchableOpacity
                style={styles.txLink}
                onPress={() => navigation.navigate("Records", { walletId: activeWallet.id })}
              >
                <Text style={styles.txLinkText}>查看交易记录 ›</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.cardBottom}>
            <Text style={styles.noWalletText}>暂无钱包</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>暂无用户</Text>
            <Text style={styles.emptyDesc}>当前没有需要管理的用户</Text>
          </View>
        }
        contentContainerStyle={users.length === 0 ? styles.emptyList : styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  listContent: { padding: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  username: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusTagText: { fontSize: 12, fontWeight: "600" },
  cardTopRight: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deactivateBtn: { backgroundColor: "#FEF3C7" },
  deactivateBtnText: { color: "#D97706", fontWeight: "600", fontSize: 13 },
  deleteBtn: { backgroundColor: "#FEE2E2" },
  deleteBtnText: { color: "#DC2626", fontWeight: "600", fontSize: 13 },
  cardBottom: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLabel: { fontSize: 14, color: "#6B7280" },
  balanceValue: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  walletCount: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
  txLink: {
    marginTop: 10,
    alignSelf: "flex-start",
  },
  txLinkText: { fontSize: 14, color: "#3B82F6", fontWeight: "500" },
  noWalletText: { fontSize: 14, color: "#9CA3AF" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#374151" },
  emptyDesc: { fontSize: 14, color: "#9CA3AF", marginTop: 4 },
  emptyList: { flexGrow: 1 },
});
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { accountService } from "../services/accountService";
import type { TokenInfo } from "../types";

type Nav = NativeStackNavigationProp<RootStackParamList, "WalletAddAccount">;
type RouteType = RouteProp<RootStackParamList, "WalletAddAccount">;

export default function WalletAddAccountScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;
  const { addAccount } = useWalletStore();
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadAvailableTokens();
  }, []);

  const loadAvailableTokens = async () => {
    try {
      const result = await accountService.getAvailableTokens();
      setAvailableTokens(result.tokens);
    } catch {
      // Fallback to default tokens
      setAvailableTokens([
        {
          id: "default-trx",
          symbol: "TRX",
          name: "Tron",
          decimals: 6,
          network: "Tron",
          isActive: true,
        },
        {
          id: "default-usdt",
          symbol: "USDT",
          name: "Tether USD",
          decimals: 6,
          network: "Tron",
          isActive: true,
        },
      ]);
    }
    setLoading(false);
  };

  const handleAddAccount = async (token: TokenInfo) => {
    if (!walletId) {
      Alert.alert("错误", "钱包ID缺失");
      return;
    }
    setCreating(true);
    try {
      await addAccount(walletId, token.id, `${token.symbol} Account`);
      Alert.alert("添加成功", `${token.symbol} 账户已添加`, [
        {
          text: "继续添加",
          style: "default",
        },
        {
          text: "进入钱包",
          style: "cancel",
          onPress: () => {
            navigation.reset({ index: 0, routes: [{ name: "Main" }] });
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert("添加失败", err.message || "请稍后重试");
    }
    setCreating(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#3B82F6" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>为你的钱包添加账户</Text>
        <Text style={styles.headerDesc}>
          你需要添加至少一个账户后开始使用AquaD。当你选择公链和网络后，账户将被建立。
        </Text>
      </View>

      <FlatList
        data={availableTokens}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.tokenItem}
            onPress={() => handleAddAccount(item)}
            disabled={creating}
            activeOpacity={0.7}
          >
            <View style={styles.tokenIconCircle}>
              <Text style={styles.tokenIconText}>{item.symbol.charAt(0)}</Text>
            </View>
            <View style={styles.tokenInfo}>
              <Text style={styles.tokenName}>{item.name}</Text>
              <Text style={styles.tokenSymbol}>{item.symbol} · {item.network}</Text>
            </View>
            <Text style={styles.addArrow}>›</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F5F6F8",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  headerDesc: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 22,
  },
  listContent: {
    paddingHorizontal: 24,
  },
  tokenItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tokenIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
  },
  tokenIconText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  tokenInfo: {
    flex: 1,
    marginLeft: 12,
  },
  tokenName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  tokenSymbol: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  addArrow: {
    fontSize: 20,
    color: "#9CA3AF",
    fontWeight: "300",
  },
});
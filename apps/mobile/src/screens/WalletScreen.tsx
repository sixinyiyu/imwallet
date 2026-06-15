import React, { useEffect, useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { useAuthStore } from "../stores/authStore";
import BalanceCard from "../components/BalanceCard";
import TokenList from "../components/TokenList";
import ActionButtons from "../components/ActionButtons";
import { ScanIcon } from "../components/icons";
import type { TokenBalance } from "../types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function WalletScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuthStore();
  const {
    wallets,
    activeWallet,
    totalBalanceUsd,
    tokens,
    loading,
    fetchWallets,
    setActiveWallet,
    fetchBalance,
  } = useWalletStore();
  const [refreshing, setRefreshing] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);

  const initialCheckDone = useRef(false);

  useFocusEffect(
    useCallback(() => {
      fetchWallets().then(() => {
        if (!initialCheckDone.current) {
          initialCheckDone.current = true;
          const { wallets, hasFetched } = useWalletStore.getState();
          if (hasFetched && wallets.length === 0) {
            navigation.navigate("WalletCreate");
          }
        }
      });
    }, [])
  );

  useEffect(() => {
    if (activeWallet) {
      fetchBalance(activeWallet.id);
    }
  }, [activeWallet]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWallets();
    if (activeWallet) {
      await fetchBalance(activeWallet.id);
    }
    setRefreshing(false);
  };

  const handleCopyAddress = () => {
    if (activeWallet?.address) {
      const Clipboard = require("expo-clipboard");
      Clipboard.setStringAsync(activeWallet.address);
      Alert.alert("已复制", "钱包地址已复制到剪贴板");
    }
  };

  const handleReceive = (token: TokenBalance) => {
    navigation.navigate("Receive", {
      tokenSymbol: token.symbol,
      tokenId: token.tokenId,
    });
  };

  const closeWalletMenu = () => setWalletMenuOpen(false);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.username}>{user?.username ?? "未登录"}</Text>
        <TouchableOpacity
          style={styles.walletSelector}
          onPress={() => setWalletMenuOpen(!walletMenuOpen)}
        >
          <Text style={styles.walletSelectorText} numberOfLines={1}>
            {activeWallet?.alias ?? "选择钱包"} ▼
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => navigation.navigate("Scan")}
        >
          <ScanIcon size={22} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Wallet menu dropdown — floating overlay */}
      <Modal
        visible={walletMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeWalletMenu}
      >
        <Pressable style={styles.dropdownOverlay} onPress={closeWalletMenu}>
          <View style={styles.dropdown}>
            {wallets.map((w) => (
              <TouchableOpacity
                key={w.id}
                style={[
                  styles.dropdownItem,
                  w.id === activeWallet?.id && styles.dropdownItemActive,
                ]}
                onPress={() => {
                  setActiveWallet(w);
                  closeWalletMenu();
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    w.id === activeWallet?.id && styles.dropdownItemTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {w.alias}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Balance Card */}
        <BalanceCard
          totalBalanceUsd={totalBalanceUsd}
          address={activeWallet?.address ?? ""}
          onCopy={handleCopyAddress}
        />

        {/* Action Buttons — 代币收款 */}
        <ActionButtons
          onTransfer={() => navigation.navigate("Transfer", {})}
          onReceive={handleReceive}
          onRecords={() => navigation.navigate("Records", {})}
          tokens={tokens}
        />

        {/* Token List */}
        <Text style={styles.sectionTitle}>代币</Text>
        <TokenList
          tokens={tokens}
          onTokenPress={(token) =>
            navigation.navigate("TokenDetail", { tokenSymbol: token.symbol })
          }
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  username: { fontSize: 14, color: "#6B7280", marginRight: 8 },
  walletSelector: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  walletSelectorText: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  scanButton: { padding: 4 },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.15)",
    paddingTop: 100,
    paddingHorizontal: 16,
  },
  dropdown: {
    backgroundColor: "#fff",
    borderRadius: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dropdownItemActive: {
    backgroundColor: "#EFF6FF",
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
  },
  dropdownItemTextActive: {
    color: "#3B82F6",
    fontWeight: "700",
  },
  content: { flex: 1 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
});
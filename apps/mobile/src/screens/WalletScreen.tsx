import React, { useEffect, useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  Pressable,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWalletStore } from "../stores/walletStore";
import BalanceCard from "../components/BalanceCard";
import TokenList from "../components/TokenList";
import ActionButtons from "../components/ActionButtons";
import { ScanIcon } from "../components/icons";
import type { TokenBalance } from "../types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function WalletScreen() {
  const navigation = useNavigation<Nav>();
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
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchWallets();
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

  const handleReceive = (token: TokenBalance) => {
    navigation.navigate("Receive", {
      tokenSymbol: token.symbol,
      tokenId: token.tokenId,
    });
  };

  const handleTransfer = () => {
    navigation.navigate("Transfer", {});
  };

  const closeWalletMenu = () => setWalletMenuOpen(false);

  // 无钱包时显示空状态引导
  if (wallets.length === 0 && !loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.walletSelectorText}>钱包</Text>
        </View>

        <View style={styles.emptyContent}>
          <Text style={styles.emptyIcon}>👛</Text>
          <Text style={styles.emptyTitle}>还没有钱包</Text>
          <Text style={styles.emptyDesc}>创建或导入一个钱包，开始使用</Text>
          <TouchableOpacity
            style={styles.emptyCreateButton}
            onPress={() => navigation.navigate("WalletCreate")}
            activeOpacity={0.7}
          >
            <Text style={styles.emptyCreateButtonText}>创建钱包</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.emptyImportButton}
            onPress={() => navigation.navigate("WalletImport")}
            activeOpacity={0.7}
          >
            <Text style={styles.emptyImportButtonText}>导入钱包</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.walletSelector}
          onPress={() => setWalletMenuOpen(!walletMenuOpen)}
        >
          <Text style={styles.walletSelectorText} numberOfLines={1}>
            {activeWallet?.alias ?? "选择钱包"} <Text style={styles.arrow}>▼</Text>
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => navigation.navigate("Scan")}
        >
          <ScanIcon size={22} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Wallet menu dropdown */}
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
                  {w.alias} ({w.accountCount}个账户)
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Fixed top section: Balance + Action Buttons */}
      <View style={styles.fixedSection}>
        {/* Balance Card */}
        <BalanceCard
          totalBalanceUsd={totalBalanceUsd}
        />

        {/* Action Buttons */}
        <ActionButtons
          onTransfer={handleTransfer}
          onReceive={handleReceive}
          onRecords={() => navigation.navigate("Records", {})}
          tokens={tokens}
        />
      </View>

      {/* Scrollable bottom section: Tokens */}
      <ScrollView
        style={styles.scrollSection}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
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
  container: { flex: 1, backgroundColor: "#F5F6F8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  walletSelector: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  walletSelectorText: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  arrow: { color: "#6B7280" },
  scanButton: { padding: 4 },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.15)",
    paddingTop: 100,
    paddingHorizontal: 16,
  },
  dropdown: {
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#DBEAFE",
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1F2937",
  },
  dropdownItemTextActive: {
    color: "#3B82F6",
    fontWeight: "700",
  },
  fixedSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  scrollSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  // ─── 空状态样式 ───
  emptyContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 32,
  },
  emptyCreateButton: {
    backgroundColor: "#287220",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    alignItems: "center",
    marginBottom: 16,
  },
  emptyCreateButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  emptyImportButton: {
    backgroundColor: "#E8F9B0",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    alignItems: "center",
  },
  emptyImportButtonText: {
    color: "#287220",
    fontSize: 15,
    fontWeight: "600",
  },
});
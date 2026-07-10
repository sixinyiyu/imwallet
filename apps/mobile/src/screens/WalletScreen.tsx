import { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  Pressable,
  AppState,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWalletStore } from "../stores/walletStore";
import { notificationSyncService } from "../services/notificationSyncService";
import BalanceCard from "../components/BalanceCard";
import TokenList from "../components/TokenList";
import ActionButtons from "../components/ActionButtons";
import { ScanIcon } from "../components/icons";
import type { AssetBalance } from "../types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function WalletScreen() {
  const navigation = useNavigation<Nav>();

  // 前后台切换时触发通知同步 + 余额刷新
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        notificationSyncService.syncNotifications();
        const w = useWalletStore.getState().activeWallet;
        if (w) {
          fetchBalance(w.id);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const {
    wallets,
    activeWallet,
    totalBalanceUsd,
    assets,
    loading,
    hasFetched,
    balanceLoading,
    fetchWallets,
    setActiveWallet,
    fetchBalance,
  } = useWalletStore();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // 钱包列表已在内存中缓存，不再每次聚焦都 fetchWallets 查库
      // 只刷新余额（充值后余额可能已变化）
      // fetchBalance 已有 in-flight dedup，不会重复请求
      const w = useWalletStore.getState().activeWallet;
      if (w) {
        fetchBalance(w.id);
      }
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWallets();
    if (activeWallet) {
      await fetchBalance(activeWallet.id);
    }
    setRefreshing(false);
  };

  const handleReceive = (asset: AssetBalance) => {
    navigation.navigate("Receive", {
      tokenSymbol: asset.symbol,
      tokenId: asset.assetId,
    });
  };

  const handleTransfer = (asset: AssetBalance) => {
    navigation.navigate("Transfer", {
      tokenSymbol: asset.symbol,
      tokenId: asset.assetId,
    });
  };

  const closeWalletMenu = () => setWalletMenuOpen(false);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.walletSelector}
          onPress={() => setWalletMenuOpen(!walletMenuOpen)}
        >
          <Text style={styles.walletSelectorText} numberOfLines={1}>
            {activeWallet?.name ?? "选择钱包"} <Text style={styles.arrow}>▼</Text>
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
                  {w.name}{w.isReadOnly ? " (订阅)" : ""}
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
          assets={assets}
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
          assets={assets}
          loading={loading || !hasFetched || balanceLoading}
          onAssetPress={(asset) =>
            navigation.navigate("TokenDetail", { tokenSymbol: asset.symbol })
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
});
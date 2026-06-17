import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { WalletIcon } from "../components/icons";
import { ChevronRightIcon } from "../components/icons";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function WalletManageScreen() {
  const navigation = useNavigation<Nav>();
  const {
    wallets,
    loading,
    fetchWallets,
    setActiveWallet,
    accountCount,
  } = useWalletStore();
  const [showAddWalletDrawer, setShowAddWalletDrawer] = useState(false);

  useEffect(() => {
    fetchWallets();
  }, []);

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={{ padding: 32 }} color="#3B82F6" />
      ) : (
        <FlatList
          data={wallets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <View style={styles.walletCard}>
              {/* Card top: alias + chevron → navigate to detail */}
              <TouchableOpacity
                style={styles.cardTop}
                onPress={() => navigation.navigate("WalletDetail", { walletId: item.id })}
                activeOpacity={0.6}
              >
                <WalletIcon size={20} color="#3B82F6" />
                <Text style={styles.walletAlias}>{item.alias}</Text>
                {index === 0 && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>当前</Text>
                  </View>
                )}
                <View style={styles.chevronWrap}>
                  <ChevronRightIcon size={18} color="#9CA3AF" />
                </View>
              </TouchableOpacity>

              {/* Account count + backup status */}
              <View style={styles.cardMiddle}>
                <Text style={styles.walletAccountCount}>
                  {item.accountCount}个账户
                </Text>
                <Text style={styles.walletBackupStatus}>
                  {item.isBackedUp ? "✅ 已备份" : "⚠️ 未备份"}
                </Text>
              </View>

              {/* Actions */}
              <View style={styles.cardActions}>
                {index !== 0 ? (
                  <TouchableOpacity
                    style={styles.activateBtn}
                    onPress={() => setActiveWallet(item)}
                  >
                    <Text style={styles.activateBtnText}>切换</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => navigation.navigate("WalletAddAccount", { walletId: item.id })}
                  >
                    <Text style={styles.addAccountLink}>+ 添加账户</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}

      {/* Add wallet button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddWalletDrawer(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.addButtonText}>+ 添加钱包</Text>
      </TouchableOpacity>

      {/* Drawer-style popup for adding wallet */}
      <Modal
        visible={showAddWalletDrawer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddWalletDrawer(false)}
      >
        <Pressable
          style={styles.drawerOverlay}
          onPress={() => setShowAddWalletDrawer(false)}
        >
          <View style={styles.drawerContent}>
            <Text style={styles.drawerTitle}>添加钱包</Text>

            <TouchableOpacity
              style={styles.drawerOption}
              onPress={() => {
                setShowAddWalletDrawer(false);
                navigation.navigate("WalletCreate");
              }}
              activeOpacity={0.7}
            >
              <View style={styles.drawerOptionIcon}>
                <Text style={styles.drawerOptionIconText}>✨</Text>
              </View>
              <View style={styles.drawerOptionInfo}>
                <Text style={styles.drawerOptionTitle}>创建钱包</Text>
                <Text style={styles.drawerOptionDesc}>
                  生成新的钱包
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.drawerOption}
              onPress={() => {
                setShowAddWalletDrawer(false);
                navigation.navigate("WalletImport");
              }}
              activeOpacity={0.7}
            >
              <View style={styles.drawerOptionIcon}>
                <Text style={styles.drawerOptionIconText}>📥</Text>
              </View>
              <View style={styles.drawerOptionInfo}>
                <Text style={styles.drawerOptionTitle}>导入钱包</Text>
                <Text style={styles.drawerOptionDesc}>
                  使用助记词导入
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  walletCard: {
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
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chevronWrap: {
    marginLeft: "auto",
  },
  walletAlias: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  activeBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeBadgeText: {
    fontSize: 11,
    color: "#3B82F6",
    fontWeight: "500",
  },
  cardMiddle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  walletAccountCount: {
    fontSize: 13,
    color: "#3B82F6",
    fontWeight: "500",
  },
  walletBackupStatus: {
    fontSize: 12,
    color: "#6B7280",
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  activateBtn: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  activateBtnText: {
    color: "#3B82F6",
    fontWeight: "500",
    fontSize: 13,
  },
  addAccountLink: {
    fontSize: 13,
    color: "#3B82F6",
    fontWeight: "500",
  },
  addButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 24,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  drawerContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 24,
  },
  drawerOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  drawerOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerOptionIconText: {
    fontSize: 20,
  },
  drawerOptionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  drawerOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  drawerOptionDesc: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
});
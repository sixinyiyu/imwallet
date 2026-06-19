import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { accountService } from "../services/accountService";
import { WalletIcon, TronIcon, EthIcon, BtcIcon } from "../components/icons";
import { ChevronRightIcon } from "../components/icons";
import type { Account } from "../types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** 根据 network 获取对应图标组件（PascalCase） */
function getNetworkIcon(network: string): React.FC<{ size?: number; color?: string }> | null {
  if (network === "Tron") return TronIcon;
  if (network === "Ethereum") return EthIcon;
  if (network === "Bitcoin") return BtcIcon;
  return null;
}

export default function WalletManageScreen() {
  const navigation = useNavigation<Nav>();
  const {
    wallets,
    hasFetched,
    fetchWallets,
    backedUpWallets,
  } = useWalletStore();
  const [showAddWalletDrawer, setShowAddWalletDrawer] = useState(false);
  /** 每个钱包的账户列表映射 walletId -> Account[] */
  const [walletAccountsMap, setWalletAccountsMap] = useState<Record<string, Account[]>>({});

  useEffect(() => {
    fetchWallets();
  }, []);

  /** 为所有钱包获取账户数据 */
  const fetchAllWalletAccounts = useCallback(async (walletIds: string[]) => {
    const results = await Promise.all(
      walletIds.map(async (wid): Promise<[string, Account[]]> => {
        try {
          const data = await accountService.getWalletAccounts(wid);
          return [wid, data.accounts];
        } catch {
          return [wid, []];
        }
      })
    );
    const map: Record<string, Account[]> = {};
    for (const [wid, accs] of results) {
      map[wid] = accs;
    }
    setWalletAccountsMap(map);
  }, []);

  /** 监听 wallets 变化，获取所有钱包的账户 */
  useEffect(() => {
    if (wallets.length > 0) {
      fetchAllWalletAccounts(wallets.map((w) => w.id));
    }
  }, [wallets, fetchAllWalletAccounts]);

  /** Drawer 弹窗（创建/导入钱包） */
  const renderDrawer = () => (
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
  );

  // 加载守卫：未完成首次加载时显示全屏 spinner，避免空→满的视觉跳动
  if (!hasFetched) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  // 空状态：无钱包时显示引导页（含居中添加按钮）
  if (wallets.length === 0) {
    return (
      <SafeAreaView style={styles.emptyScreen}>
        <View style={styles.emptyContent}>
          <Text style={styles.emptyIcon}>👛</Text>
          <Text style={styles.emptyTitle}>还没有钱包</Text>
          <Text style={styles.emptyDesc}>创建或导入一个钱包，开始使用</Text>
          <TouchableOpacity
            style={styles.emptyAddButton}
            onPress={() => setShowAddWalletDrawer(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.emptyAddButtonText}>+ 添加钱包</Text>
          </TouchableOpacity>
        </View>

        {renderDrawer()}
      </SafeAreaView>
    );
  }

  // 正常状态：钱包列表 + 固定底部按钮
  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={wallets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => {
          const walletAccounts = walletAccountsMap[item.id] || [];
          const hasAccounts = walletAccounts.length > 0;

          return (
            <View style={styles.walletCard}>
              {/* Card top: alias + chevron → navigate to detail */}
              <TouchableOpacity
                style={styles.cardTop}
                onPress={() => navigation.navigate("WalletDetail", { walletId: item.id })}
                activeOpacity={0.6}
              >
                <WalletIcon size={20} color="#9CA3AF" />
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
                  {backedUpWallets.has(item.id) ? "✅ 已备份" : "⚠️ 未备份"}
                </Text>
              </View>

              {/* Actions: 左侧提示/图标 + 右侧添加账户 */}
              <View style={styles.cardActions}>
                <View style={styles.actionLeft}>
                  {hasAccounts ? (
                    <View style={styles.iconRow}>
                      {walletAccounts.map((acc, i) => {
                        const IconComp = getNetworkIcon(acc.network);
                        return IconComp ? <IconComp key={acc.id} size={20} /> : null;
                      })}
                    </View>
                  ) : (
                    <Text style={styles.noAccountHint}>使用之前，先添加账户</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate("WalletAddAccount", { walletId: item.id })}
                >
                  <Text style={styles.addAccountLink}>+ 添加账户</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {/* Fixed bottom button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddWalletDrawer(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.addButtonText}>+ 添加钱包</Text>
      </TouchableOpacity>

      {renderDrawer()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: "#F5F6F8",
    justifyContent: "center",
    alignItems: "center",
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
    paddingLeft: 28,
  },
  walletAccountCount: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  walletBackupStatus: {
    fontSize: 12,
    color: "#6B7280",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  actionLeft: {
    flex: 1,
    paddingLeft: 28,
  },
  iconRow: {
    flexDirection: "row",
    gap: 6,
  },
  noAccountHint: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  addAccountLink: {
    fontSize: 13,
    color: "#287220",
    fontWeight: "500",
  },
  addButton: {
    backgroundColor: "#287220",
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
  // ─── 空状态样式 ───
  emptyScreen: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
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
  emptyAddButton: {
    backgroundColor: "#287220",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    alignItems: "center",
  },
  emptyAddButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  // ─── Drawer 样式 ───
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
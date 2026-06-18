import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { accountService } from "../services/accountService";
import { LinearGradient } from "expo-linear-gradient";
import { TronIcon, USDTIcon } from "../components/icons";
import type { TokenInfo } from "../types";

type Nav = NativeStackNavigationProp<RootStackParamList, "WalletAddAccount">;
type RouteType = RouteProp<RootStackParamList, "WalletAddAccount">;

const accountImage = require("../../assets/account.png");
const SCREEN_HEIGHT = Dimensions.get("window").height;

/** 预置代币图标映射 */
const TOKEN_ICONS: Record<string, React.FC<{ size?: number }>> = {
  TRX: TronIcon,
  USDT: USDTIcon,
};

export default function WalletAddAccountScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;
  const { addAccount } = useWalletStore();

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedNetworks, setSelectedNetworks] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [networks, setNetworks] = useState<TokenInfo[]>([]);
  const [networksLoaded, setNetworksLoaded] = useState(false);
  /** 已有账户的网络集合（锁定选中，不可操作） */
  const [existingNetworks, setExistingNetworks] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // 并行加载：可创建账户的代币列表 + 钱包已有账户
      const [networksResult, accountsResult] = await Promise.all([
        accountService.getAvailableNetworks(),
        walletId ? accountService.getWalletAccounts(walletId) : Promise.resolve({ accounts: [] }),
      ]);

      // 从 networks 中提取所有代币（用于展示）
      const allTokens: TokenInfo[] = [];
      for (const net of networksResult.networks) {
        allTokens.push(...net.tokens);
      }
      setNetworks(allTokens);

      // 记录已有账户的网络
      const existing = new Set<string>();
      for (const acc of accountsResult.accounts) {
        existing.add(acc.network);
      }
      setExistingNetworks(existing);
    } catch {
      // API 失败，使用预置 TRX
      setNetworks([
        { id: "default-trx", symbol: "TRX", name: "Tron", decimals: 6, network: "Tron", isActive: true, isAccountToken: true },
      ]);
    }
    setNetworksLoaded(true);
  };

  const toggleNetwork = (network: string) => {
    // 已有账户的网络不可操作
    if (existingNetworks.has(network)) return;

    setSelectedNetworks((prev) => {
      const next = new Set(prev);
      if (next.has(network)) {
        next.delete(network);
      } else {
        next.add(network);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selectedNetworks.size === 0) return;
    if (!walletId) {
      Alert.alert("错误", "钱包ID缺失");
      return;
    }
    setCreating(true);
    try {
      // 逐个添加选中的网络账户，单个失败不阻塞后续
      for (const network of selectedNetworks) {
        try {
          await addAccount(walletId, network, `${network} Account`);
        } catch {
          // 单个账户添加失败不阻塞流程
        }
      }
    } catch {
      // 整体异常也不阻塞
    }
    setDrawerVisible(false);
    setCreating(false);
    // 跳转到钱包备份引导页
    navigation.replace("BackupGuide", { walletId, source: "create" });
  };

  // 只有新选择的网络才算有效选择（已有账户的不算）
  const hasNewSelection = selectedNetworks.size > 0;

  return (
    <View style={styles.container}>
      {/* 上方图片区域 - 占屏幕 3/5 */}
      <View style={styles.imageArea}>
        <Image
          source={accountImage}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={["transparent", "#F5F6F8"]}
          style={styles.fadeOverlay}
        />
      </View>

      {/* 下方内容区域 */}
      <View style={styles.contentArea}>
        <Text style={styles.title}>为你的钱包添加账户</Text>
        <Text style={styles.desc}>
          你需要添加至少一个账户后开始使用AquaD。当你选择公链和网络后，账户将被建立。
        </Text>

        <View style={styles.bottomArea}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setSelectedNetworks(new Set());
              setDrawerVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.addButtonText}>立即添加账号</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 抽屉弹窗 */}
      <Modal
        visible={drawerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDrawerVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDrawerVisible(false)}>
          <View style={drawerStyles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={drawerStyles.drawer}>
          {/* 标题 */}
          <Text style={drawerStyles.drawerTitle}>添加账号</Text>
          {/* 说明文字 */}
          <Text style={drawerStyles.drawerDesc}>
            选择你需要的特定账户类型，完成响应账户的添加。
          </Text>

          {/* 代币卡片列表 - 多选 */}
          {!networksLoaded ? (
            <ActivityIndicator color="#3B82F6" size="large" style={{ marginTop: 20 }} />
          ) : (
          <View style={drawerStyles.tokenList}>
            {networks.map((token) => {
              const IconComp = TOKEN_ICONS[token.symbol] ?? TronIcon;
              const isSelected = selectedNetworks.has(token.network);
              const isExisting = existingNetworks.has(token.network);
              const isLocked = isExisting; // 已有账户的网络锁定选中
              return (
                <TouchableOpacity
                  key={token.id}
                  style={[
                    drawerStyles.tokenCard,
                    (isSelected || isLocked) && drawerStyles.tokenCardSelected,
                    isLocked && drawerStyles.tokenCardLocked,
                  ]}
                  onPress={() => toggleNetwork(token.network)}
                  activeOpacity={0.7}
                  disabled={isLocked}
                >
                  <View style={drawerStyles.tokenIconWrap}>
                    <IconComp size={36} />
                  </View>
                  <View style={drawerStyles.tokenInfo}>
                    <Text style={drawerStyles.tokenName}>{token.name}</Text>
                    <Text style={drawerStyles.tokenSymbol}>
                      {token.symbol} · {token.network}
                    </Text>
                  </View>
                  {/* 多选 checkbox */}
                  <View
                    style={[
                      drawerStyles.checkboxOuter,
                      (isSelected || isLocked) && drawerStyles.checkboxOuterSelected,
                      isLocked && drawerStyles.checkboxOuterLocked,
                    ]}
                  >
                    {(isSelected || isLocked) && <Text style={drawerStyles.checkboxTick}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          )}

          {/* 提示文字 */}
          {!hasNewSelection && (
            <Text style={drawerStyles.hintText}>请先选择账户</Text>
          )}

          {/* 确认按钮 */}
          <TouchableOpacity
            style={[
              drawerStyles.confirmButton,
              (!hasNewSelection || creating) && drawerStyles.confirmButtonDisabled,
            ]}
            onPress={handleConfirm}
            disabled={!hasNewSelection || creating}
            activeOpacity={0.7}
          >
            {creating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={drawerStyles.confirmButtonText}>确认</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  imageArea: {
    height: SCREEN_HEIGHT * 0.6,
    width: "100%",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  fadeOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  contentArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    justifyContent: "space-between",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 12,
  },
  desc: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 22,
  },
  bottomArea: {
    paddingBottom: 24,
  },
  addButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
});

const drawerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  drawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 34,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  drawerDesc: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 22,
    marginBottom: 20,
  },
  tokenList: {
    gap: 12,
  },
  tokenCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  tokenCardSelected: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  tokenCardLocked: {
    borderColor: "#D1D5DB",
    backgroundColor: "#F3F4F6",
    opacity: 0.7,
  },
  tokenIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
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
    marginTop: 2,
  },
  checkboxOuter: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxOuterSelected: {
    borderColor: "#3B82F6",
    backgroundColor: "#3B82F6",
  },
  checkboxOuterLocked: {
    borderColor: "#9CA3AF",
    backgroundColor: "#9CA3AF",
  },
  checkboxTick: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  hintText: {
    fontSize: 13,
    color: "#F59E0B",
    marginTop: 16,
    marginBottom: 4,
  },
  confirmButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  confirmButtonDisabled: {
    backgroundColor: "#E5E7EB",
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
});

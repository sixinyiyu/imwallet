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

/** 预置代币列表（含图标组件） */
const PRESET_TOKENS: (TokenInfo & { icon: React.FC<{ size?: number }> })[] = [
  {
    id: "default-trx",
    symbol: "TRX",
    name: "Tron",
    decimals: 6,
    network: "Tron",
    isActive: true,
    icon: TronIcon,
  },
  {
    id: "default-usdt",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    network: "Tron",
    isActive: true,
    icon: USDTIcon,
  },
];

export default function WalletAddAccountScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;
  const { addAccount } = useWalletStore();

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [tokens, setTokens] = useState<(TokenInfo & { icon: React.FC<{ size?: number }> })[]>([]);
  const [tokensLoaded, setTokensLoaded] = useState(false);

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    try {
      const result = await accountService.getAvailableTokens();
      if (result.tokens && result.tokens.length > 0) {
        const merged = result.tokens.map((t) => {
          const preset = PRESET_TOKENS.find((p) => p.symbol === t.symbol);
          return {
            ...t,
            icon: preset?.icon ?? TronIcon,
          };
        });
        setTokens(merged);
      } else {
        // API 返回空列表，使用预置代币
        setTokens(PRESET_TOKENS);
      }
    } catch {
      // API 失败，使用预置代币
      setTokens(PRESET_TOKENS);
    }
    setTokensLoaded(true);
  };

  const toggleToken = (tokenId: string) => {
    setSelectedTokenIds((prev) => {
      const next = new Set(prev);
      if (next.has(tokenId)) {
        next.delete(tokenId);
      } else {
        next.add(tokenId);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selectedTokenIds.size === 0) return;
    if (!walletId) {
      Alert.alert("错误", "钱包ID缺失");
      return;
    }
    setCreating(true);
    try {
      // 逐个添加选中的代币账户，单个失败不阻塞后续
      for (const tokenId of selectedTokenIds) {
        const token = tokens.find((t) => t.id === tokenId);
        try {
          await addAccount(walletId, tokenId, `${token?.symbol ?? ""} Account`);
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
    navigation.replace("BackupGuide", { walletId });
  };

  const hasSelection = selectedTokenIds.size > 0;

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
              setSelectedTokenIds(new Set());
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
          {!tokensLoaded ? (
            <ActivityIndicator color="#3B82F6" size="large" style={{ marginTop: 20 }} />
          ) : (
          <View style={drawerStyles.tokenList}>
            {tokens.map((token) => {
              const IconComp = token.icon;
              const isSelected = selectedTokenIds.has(token.id);
              return (
                <TouchableOpacity
                  key={token.id}
                  style={[
                    drawerStyles.tokenCard,
                    isSelected && drawerStyles.tokenCardSelected,
                  ]}
                  onPress={() => toggleToken(token.id)}
                  activeOpacity={0.7}
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
                      isSelected && drawerStyles.checkboxOuterSelected,
                    ]}
                  >
                    {isSelected && <Text style={drawerStyles.checkboxTick}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          )}

          {/* 提示文字 */}
          {!hasSelection && (
            <Text style={drawerStyles.hintText}>请先选择账户</Text>
          )}

          {/* 确认按钮 */}
          <TouchableOpacity
            style={[
              drawerStyles.confirmButton,
              (!hasSelection || creating) && drawerStyles.confirmButtonDisabled,
            ]}
            onPress={handleConfirm}
            disabled={!hasSelection || creating}
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
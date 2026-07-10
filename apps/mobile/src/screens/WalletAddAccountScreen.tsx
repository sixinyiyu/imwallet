import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
  Animated,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { accountService } from "../services/accountService";
import { localAccountService } from "../services/localAccountService";
import { LinearGradient } from "expo-linear-gradient";
import { TOKEN_ICONS, TronIcon, EthIcon, BtcIcon } from "../components/icons";
import { LoadingOverlay } from "../components/LoadingOverlay";
import type { ChainInfo } from "../types";
import { useAlert } from "../hooks/useAlert";
import { configService } from "../services/configService";

type Nav = NativeStackNavigationProp<RootStackParamList, "WalletAddAccount">;
type RouteType = RouteProp<RootStackParamList, "WalletAddAccount">;

const accountImage = require("../../assets/account.png");
const SCREEN_HEIGHT = Dimensions.get("window").height;

/** 预置链图标映射 */
const CHAIN_ICONS: Record<string, React.FC<{ size?: number }>> = {
  Tron: TronIcon,
  Ethereum: EthIcon,
  Bitcoin: BtcIcon,
};


export default function WalletAddAccountScreen() {
  const alert = useAlert();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;
  const { addAccounts, activeWallet } = useWalletStore();
  // 兜底：作为初始路由时无 params，从 store 获取当前钱包 ID
  const effectiveWalletId = walletId || activeWallet?.id;

  // 淡入动画
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedChains, setSelectedChains] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [creatingStage, setCreatingStage] = useState("添加中");
  const [chains, setChains] = useState<ChainInfo[]>([]);
  const [chainsLoaded, setChainsLoaded] = useState(false);
  /** 已有账户的链集合（该链下所有代币账户都已存在） */
  const [existingChains, setExistingChains] = useState<Set<string>>(new Set());
  /** 同链多账户开关（本地配置，默认关闭） */
  const [multiAccountEnabled, setMultiAccountEnabled] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // 读取同链多账户本地配置
    const multiEnabled = await configService.getMultiAccountEnabled();
    setMultiAccountEnabled(multiEnabled);

    try {
      // 并行加载：可创建账户的链列表 + 钱包已有账户
      const [chainsResult, walletAccounts] = await Promise.all([
        accountService.getAvailableChains(),
        effectiveWalletId ? localAccountService.getWalletAccounts(effectiveWalletId) : Promise.resolve([]),
      ]);
      setChains(chainsResult.chains);

      // 按链分组已有账户
      const accountsByChain = new Set<string>();
      for (const acc of walletAccounts) {
        accountsByChain.add(acc.chain);
      }

      // 判断每条链的状态：全部已有 / 部分已有
      const fullSet = new Set<string>();
      for (const chain of chainsResult.chains) {
        if (accountsByChain.has(chain.name)) {
          fullSet.add(chain.name);
        }
      }
      setExistingChains(fullSet);
    } catch {
      // API 失败，使用预置链
      setChains([
        {
           id: 1, name: "Tron", displayName: "Tron (TRX)", accountEnable: true,          derivationPath: "m/44'/195'/0'/0",
          assets: [
            { id: "trx-tron", symbol: "TRX", name: "Tron", type: "NATIVE", decimals: 6, isDefault: true },
            { id: "usdt-tron", symbol: "USDT", name: "Tether USD", type: "STABLECOIN", decimals: 6, isDefault: false },
          ],
        },
      ]);
    }
    setChainsLoaded(true);
  };

  const toggleChain = (chainName: string) => {
    // 同链多账户关闭时，全部已有的链不可操作
    if (!multiAccountEnabled && existingChains.has(chainName)) return;

    setSelectedChains((prev) => {
      const next = new Set(prev);
      if (next.has(chainName)) {
        next.delete(chainName);
      } else {
        next.add(chainName);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selectedChains.size === 0) return;
    if (!effectiveWalletId) {
      alert("错误", "钱包ID缺失");
      return;
    }
    setCreating(true);
    setCreatingStage("正在添加账户...");
    try {
      // 批量添加选中的链账户，一次 HTTP 请求完成所有链的服务端同步
      const chains = [...selectedChains].filter((c) => multiAccountEnabled || !existingChains.has(c));
      if (chains.length > 0) {
        await addAccounts(effectiveWalletId, chains, multiAccountEnabled, (stage) => setCreatingStage(stage));
      }
    } catch {
      // 整体异常也不阻塞
    }
    setDrawerVisible(false);
    setCreating(false);
    // 已备份（导入钱包）→ 直接回主页；未备份（创建钱包）→ 跳备份引导
    const backedUp = useWalletStore.getState().isWalletBackedUp(effectiveWalletId!);
    if (backedUp) {
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    } else {
      navigation.replace("BackupGuide", { walletId: effectiveWalletId!, source: "create" });
    }
  };

  // 只有新选择的链才算有效选择（已有账户的不算，除非开启了同链多账户）
  const hasNewSelection = multiAccountEnabled
    ? selectedChains.size > 0
    : [...selectedChains].some((c) => !existingChains.has(c));

  return (
    <>
      {/* 添加账户加载遮罩 */}
      <LoadingOverlay visible={creating} stage={creatingStage} />
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
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
              setSelectedChains(new Set());
              setDrawerVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.addButtonText}>立即添加账户</Text>
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
          <Text style={drawerStyles.drawerTitle}>添加账户</Text>
          {/* 说明文字 */}
          <Text style={drawerStyles.drawerDesc}>
            选择你需要的特定账户类型，完成相应账户的添加。
          </Text>

          {/* 链卡片列表 - 多选 */}
          {!chainsLoaded ? (
            <ActivityIndicator color="#287220" size="large" style={{ marginTop: 20 }} />
          ) : (
          <View style={drawerStyles.chainList}>
            {chains.map((chain) => {
              const isSelected = selectedChains.has(chain.name);
              const isLocked = !multiAccountEnabled && existingChains.has(chain.name);
              
              const IconComp = CHAIN_ICONS[chain.name];

              return (
                <TouchableOpacity
                  key={chain.name}
                  style={[
                    drawerStyles.chainCard,
                    (isSelected || isLocked) && drawerStyles.chainCardSelected,
                    isLocked && drawerStyles.chainCardLocked,
                  ]}
                  onPress={() => toggleChain(chain.name)}
                  activeOpacity={0.7}
                  disabled={isLocked}
                >
                  <View style={drawerStyles.chainIconWrap}>
                    {IconComp ? <IconComp size={36} /> : <Text style={drawerStyles.chainEmoji}>🔗</Text>}
                  </View>
                  <View style={drawerStyles.chainInfo}>
                    <Text style={drawerStyles.chainName}>{chain.displayName.replace(/\s*\(.*?\)/g, "")}</Text>
                    {/* 代币列表 */}
                    <View style={drawerStyles.tokenBadges}>
                      {chain.assets.map((asset) => {
                        const TokenIcon = TOKEN_ICONS[asset.symbol];
                        return (
                          <View key={asset.symbol} style={drawerStyles.tokenBadge}>
                            {TokenIcon ? <TokenIcon size={14} /> : null}
                            <Text style={drawerStyles.tokenBadgeText}>{asset.symbol}</Text>
                            <Text style={drawerStyles.tokenTypeLabel}>
                              {asset.type === "NATIVE" ? "原生币" : "合约代币"}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
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
              <Text style={[
                drawerStyles.confirmButtonText,
                !hasNewSelection && drawerStyles.confirmButtonTextDisabled,
              ]}>
                {hasNewSelection ? "确认" : "请先选择账户"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </Animated.View>
    </>
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
    backgroundColor: "#287220",
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
  chainList: {
    gap: 12,
  },
  chainCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  chainCardSelected: {
    borderColor: "#287220",
    backgroundColor: "#E8F9B0",
  },
  chainCardLocked: {
    borderColor: "#D1D5DB",
    backgroundColor: "#F3F4F6",
    opacity: 0.7,
  },
  chainIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  chainEmoji: { fontSize: 20 },
  chainInfo: {
    flex: 1,
    marginLeft: 12,
  },
  chainName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  tokenBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  tokenBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0F1F3",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tokenBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#4B5563",
  },
  tokenTypeLabel: {
    fontSize: 10,
    color: "#9CA3AF",
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
    borderColor: "#287220",
    backgroundColor: "#287220",
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
  confirmButtonTextDisabled: {
    color: "#9CA3AF",
  },
  confirmButton: {
    backgroundColor: "#287220",
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
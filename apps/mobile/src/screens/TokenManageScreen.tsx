import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { assetService } from "../services/assetService";
import type { AssetInfo } from "../types";
import { TOKEN_ICONS } from "../components/icons";
import { GreenToggle } from "../components/GreenToggle";
import { TokenManageSkeleton } from "../components/Skeleton";
import { getErrorMessage } from "../utils/format";

export default function TokenManageScreen() {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const { assets: list } = await assetService.getAssets();
      setAssets(list);
    } catch {
      showToast("加载代币列表失败");
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadAssets();
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAssets();
    setRefreshing(false);
  };

  const handleToggleTradable = async (asset: AssetInfo, value: boolean) => {
    setTogglingId(asset.id);
    try {
      await assetService.updateAssetTradable(asset.id, value);
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, isTradable: value } : a))
      );
      showToast(`${asset.symbol} 交易已${value ? "开启" : "关闭"}`);
    } catch (err: unknown) {
      showToast(getErrorMessage(err, "更新失败，请重试"));
    }
    setTogglingId(null);
  };

  const renderItem = ({ item, index }: { item: AssetInfo; index: number }) => {
    const IconComp = TOKEN_ICONS[item.symbol];
    return (
      <View style={[styles.item, index < assets.length - 1 && styles.itemBorder]}>
        <View style={styles.iconContainer}>
          {IconComp ? <IconComp size={32} /> : <Text style={styles.iconFallback}>🪙</Text>}
        </View>
        <View style={styles.info}>
          <Text style={styles.symbol}>{item.symbol}</Text>
          <Text style={styles.name}>{item.name} · {item.chain}</Text>
        </View>
        {togglingId === item.id ? (
          <ActivityIndicator size="small" color="#287220" />
        ) : (
          <GreenToggle
            value={item.isTradable ?? true}
            onValueChange={(v) => handleToggleTradable(item, v)}
          />
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <TokenManageSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={["#287220"]} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>暂无代币</Text>
          </View>
        }
      />

      {/* Toast */}
      {toastVisible && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6F8" },
  listContent: { padding: 16 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  iconFallback: { fontSize: 18 },
  info: { flex: 1 },
  symbol: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  name: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  emptyWrap: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
});
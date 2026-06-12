import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useWalletStore } from "../stores/walletStore";

export default function WalletManageScreen() {
  const { wallets, loading, fetchWallets, createWallet, deleteWallet, setActiveWallet } =
    useWalletStore();
  const [newAlias, setNewAlias] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);

  useEffect(() => {
    fetchWallets();
  }, []);

  const handleCreate = async () => {
    if (!newAlias.trim()) {
      Alert.alert("提示", "请输入钱包别名");
      return;
    }
    try {
      await createWallet(newAlias.trim());
      setNewAlias("");
      setShowCreate(false);
      Alert.alert("成功", "钱包已创建");
    } catch (err: any) {
      Alert.alert("错误", err.message || "创建失败");
    }
  };

  const handleDelete = (walletId: string, alias: string) => {
    Alert.alert("删除钱包", `确定要删除 "${alias}" 吗？此操作不可撤销。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteWallet(walletId);
          } catch (err: any) {
            Alert.alert("错误", err.message || "删除失败");
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {showCreate && (
        <View style={styles.createBox}>
          <TextInput
            style={styles.input}
            placeholder="输入钱包别名"
            value={newAlias}
            onChangeText={setNewAlias}
          />
          <View style={styles.createActions}>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={handleCreate}
            >
              <Text style={styles.createBtnText}>创建</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setShowCreate(false);
                setNewAlias("");
              }}
            >
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowCreate(true)}
      >
        <Text style={styles.addButtonText}>+ 创建新钱包</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ padding: 32 }} />
      ) : (
        <FlatList
          data={wallets}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.walletItem}>
              <View style={styles.walletInfo}>
                <Text style={styles.walletAlias}>
                  {item.alias} {item.isActive && "(当前)"}
                </Text>
                <Text style={styles.walletAddress}>
                  {item.address.slice(0, 14)}...{item.address.slice(-8)}
                </Text>
                <Text style={styles.walletSource}>
                  来源: {item.source === "CREATE" ? "创建" : "导入"}
                </Text>
              </View>
              <View style={styles.walletActions}>
                {!item.isActive && (
                  <TouchableOpacity
                    style={styles.activateBtn}
                    onPress={() => setActiveWallet(item)}
                  >
                    <Text style={styles.activateBtnText}>切换</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item.id, item.alias)}
                >
                  <Text style={styles.deleteBtnText}>删除</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  createBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  createActions: { flexDirection: "row", gap: 12 },
  createBtn: {
    flex: 1,
    backgroundColor: "#3B82F6",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  createBtnText: { color: "#fff", fontWeight: "600" },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  cancelBtnText: { color: "#6B7280", fontWeight: "500" },
  addButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  addButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  walletItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  walletInfo: { flex: 1 },
  walletAlias: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  walletAddress: {
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "monospace",
    marginTop: 4,
  },
  walletSource: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
  walletActions: { gap: 8 },
  activateBtn: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  activateBtnText: { color: "#3B82F6", fontWeight: "500" },
  deleteBtn: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteBtnText: { color: "#EF4444", fontWeight: "500" },
});

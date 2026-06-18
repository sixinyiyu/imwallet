import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  Pressable,
  Keyboard,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import EmptyState from "../components/EmptyState";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { walletService } from "../services/walletService";
import {
  WalletIcon,
  PlusCircleIcon,
  EditIcon,
  EyeOffIcon,
  EyeIcon,
  WarningIcon,
} from "../components/icons";
import type { Wallet } from "../types";

type Nav = NativeStackNavigationProp<RootStackParamList, "WalletDetail">;
type RouteType = RouteProp<RootStackParamList, "WalletDetail">;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function WalletDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;
  const { wallets, accounts, fetchAccounts, setActiveWallet, deleteWallet, fetchWallets } = useWalletStore();

  const [detail, setDetail] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHint, setShowHint] = useState(false);

  // Edit alias modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAlias, setEditAlias] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);

  // Remove wallet: Step 1 = confirm drawer, Step 2 = password drawer
  const [showConfirmDrawer, setShowConfirmDrawer] = useState(false);
  const [showRemoveDrawer, setShowRemoveDrawer] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removePassword, setRemovePassword] = useState("");
  const [showRemovePassword, setShowRemovePassword] = useState(false);
  const [removePasswordError, setRemovePasswordError] = useState("");

  // Password verification modal (for backup)
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Password error dialog (forgot password / retry)
  const [showPasswordErrorDialog, setShowPasswordErrorDialog] = useState(false);
  const [passwordErrorContext, setPasswordErrorContext] = useState<"backup" | "remove">("backup");

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const walletFromStore = wallets.find((w) => w.id === walletId);
  const wallet = detail || walletFromStore;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  // Set header right: "移除" link
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setShowConfirmDrawer(true)}
          style={{ marginRight: 16 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: "#EF4444", fontSize: 15, fontWeight: "500" }}>移除</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    loadDetail();
  }, [walletId]);

  const loadDetail = async () => {
    if (!walletId) return;
    try {
      const data = await walletService.getWalletDetail(walletId);
      setDetail(data as Wallet);
    } catch {
      setDetail(walletFromStore || null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (walletId) {
      fetchAccounts(walletId);
    }
  }, [walletId]);

  const handleCopyAddress = async () => {
    if (!wallet?.address) return;
    try {
      const Clipboard = require("expo-clipboard");
      await Clipboard.setStringAsync(wallet.address);
      showToast("复制成功");
    } catch {
      showToast("复制失败");
    }
  };

  const handleOpenEditAlias = () => {
    setEditAlias(wallet?.alias || "");
    setShowEditModal(true);
  };

  const handleConfirmEditAlias = async () => {
    if (!walletId || !editAlias.trim()) return;
    setSavingAlias(true);
    try {
      const updated = await walletService.updateWalletAlias(walletId, editAlias.trim());
      setDetail(updated as Wallet);
      await fetchWallets();
      setShowEditModal(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || "修改失败";
      Alert.alert("提示", msg);
    }
    setSavingAlias(false);
  };

  const handleSwitchWallet = async () => {
    try {
      await setActiveWallet(wallet!);
    } catch (err: any) {
      Alert.alert("提示", err.message || "切换失败");
    }
  };

  const handleRemoveWallet = async () => {
    if (!wallet || !walletId || !removePassword.trim()) return;
    setRemoving(true);
    setRemovePasswordError("");
    try {
      const verified = await walletService.verifyWalletPassword(walletId, removePassword.trim());
      if (verified) {
        await deleteWallet(wallet.id);
        setShowRemoveDrawer(false);
        navigation.goBack();
      } else {
        setShowRemoveDrawer(false);
        setPasswordErrorContext("remove");
        setShowPasswordErrorDialog(true);
      }
    } catch {
      setShowRemoveDrawer(false);
      setPasswordErrorContext("remove");
      setShowPasswordErrorDialog(true);
    }
    setRemoving(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3B82F6" size="large" />
      </View>
    );
  }

  if (!wallet) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>钱包不存在</Text>
      </View>
    );
  }

  const passwordHint = (detail as any)?.passwordHint;
  const isBackedUp = useWalletStore((s) => s.isBackedUp);

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Wallet info card */}
        <View style={styles.infoCard}>
          {/* 名称 */}
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <WalletIcon size={18} color="#3B82F6" />
              <Text style={styles.infoLabel}>名称</Text>
            </View>
            <View style={styles.infoRightWithIcon}>
              <Text style={styles.infoValue}>{wallet.alias}</Text>
              <TouchableOpacity onPress={handleOpenEditAlias} activeOpacity={0.6} style={styles.rowIcon}>
                <EditIcon size={18} color="#8899B8" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.infoDivider} />

          {/* 标识符 */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>标识符</Text>
              <TouchableOpacity
                style={styles.identifierWrap}
                onPress={handleCopyAddress}
                activeOpacity={0.6}
              >
                <Text style={styles.identifierText}>{wallet.address}</Text>
              </TouchableOpacity>
          </View>
          <View style={styles.infoDivider} />

          {/* 账户数 */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>账户数</Text>
            <Text style={styles.infoValue}>{wallet.accountCount}</Text>
          </View>
          <View style={styles.infoDivider} />

          {/* 来源 */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>来源</Text>
            <Text style={styles.infoValue}>{wallet.source === "CREATE" ? "创建" : "导入"}</Text>
          </View>
          <View style={styles.infoDivider} />

          {/* 备份状态 */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>备份状态</Text>
            {isBackedUp ? (
              <Text style={styles.backedUpText}>已备份</Text>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  setBackupPassword("");
                  setPasswordError("");
                  setShowPasswordModal(true);
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.notBackedUpLink}>未备份</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.infoDivider} />

          {/* 创建时间 */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>创建时间</Text>
            <Text style={styles.infoValue}>{formatDate(wallet.createdAt)}</Text>
          </View>

          {/* 密码提示 */}
          {passwordHint !== undefined && passwordHint !== null && (
            <>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>密码提示</Text>
                <View style={styles.hintRight}>
                  {showHint ? (
                    <Text style={styles.infoValue}>{passwordHint || "无"}</Text>
                  ) : (
                    <Text style={styles.hintHidden}>••••••</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setShowHint(!showHint)}
                    activeOpacity={0.6}
                    style={styles.rowIcon}
                  >
                    {showHint ? (
                      <EyeIcon size={18} color="#8899B8" />
                    ) : (
                      <EyeOffIcon size={18} color="#8899B8" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Account list section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>账户列表</Text>
          <TouchableOpacity
            style={styles.addAccountLink}
            onPress={() => navigation.navigate("WalletAddAccount", { walletId: wallet.id })}
            activeOpacity={0.6}
          >
            <PlusCircleIcon size={18} color="#3B82F6" />
            <Text style={styles.addAccountLinkText}>添加账户</Text>
          </TouchableOpacity>
        </View>

        {accounts.length === 0 ? (
          <EmptyState message="暂无账户" />
        ) : (
          accounts.map((acc) => (
            <View key={acc.id} style={styles.accountCard}>
              <View style={styles.accountIconCircle}>
                <Text style={styles.accountIconText}>{acc.network.charAt(0)}</Text>
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.accountName}>{acc.name}</Text>
                <Text style={styles.accountSymbol}>{acc.network}</Text>
              </View>
            </View>
          ))
        )}

        {/* Actions */}
        {wallets.length > 1 && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.switchBtn}
              onPress={handleSwitchWallet}
              activeOpacity={0.7}
            >
              <Text style={styles.switchBtnText}>切换为当前钱包</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Toast */}
      {toastVisible && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        </View>
      )}

      {/* ── Step 1: Confirm drawer ── */}
      <Modal
        visible={showConfirmDrawer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirmDrawer(false)}
      >
        <Pressable style={styles.drawerOverlay} onPress={() => setShowConfirmDrawer(false)}>
          <Pressable style={styles.drawerContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.confirmIconWrap}>
              <WarningIcon size={48} color="#F65450" />
            </View>
            <Text style={styles.confirmTitle}>确认移除该钱包？</Text>
            <Text style={styles.confirmDesc}>
              {accounts.length > 0
                ? "此钱包已关联地址本数据，钱包移除后地址本数据也将被删除。"
                : "在删除钱包之前，请确保你已经做好了钱包备份。助记词/私钥是资产唯一的所有权证明。"}
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setShowConfirmDrawer(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmRemoveBtn}
                onPress={() => {
                  setShowConfirmDrawer(false);
                  setRemovePassword("");
                  setRemovePasswordError("");
                  setShowRemoveDrawer(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmRemoveText}>移除</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Step 2: Password drawer ── */}
      <Modal
        visible={showRemoveDrawer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRemoveDrawer(false)}
      >
        <Pressable style={styles.drawerOverlay} onPress={() => setShowRemoveDrawer(false)}>
          <Pressable style={styles.drawerContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.drawerPasswordTitle}>密码</Text>

            {/* Password input with eye icon */}
            <View style={styles.drawerInputRow}>
              <TextInput
                style={styles.drawerInput}
                value={removePassword}
                onChangeText={(text) => { setRemovePassword(text); setRemovePasswordError(""); }}
                placeholder="钱包密码"
                placeholderTextColor="#C8C9CC"
                secureTextEntry={!showRemovePassword}
                autoComplete="current-password"
                autoFocus
              />
              <TouchableOpacity
                style={styles.drawerEyeBtn}
                onPress={() => setShowRemovePassword(!showRemovePassword)}
                activeOpacity={0.6}
              >
                {showRemovePassword ? (
                  <EyeIcon size={20} color="#8899B8" />
                ) : (
                  <EyeOffIcon size={20} color="#C4C5C5" />
                )}
              </TouchableOpacity>
            </View>

            {removePasswordError ? (
              <Text style={styles.errorText}>{removePasswordError}</Text>
            ) : null}

            {/* Forgot password link */}
            <TouchableOpacity
              style={styles.forgotPwdLink}
              onPress={() => {
                setShowRemoveDrawer(false);
                navigation.navigate("ForgotPassword", { walletId: wallet.id });
              }}
              activeOpacity={0.6}
            >
              <Text style={styles.forgotPwdText}>忘记密码?</Text>
            </TouchableOpacity>

            {/* Remove button */}
            <TouchableOpacity
              style={[styles.drawerRemoveBtn, (!removePassword.trim() || removing) ? styles.drawerRemoveBtnDisabled : null]}
              onPress={handleRemoveWallet}
              disabled={!removePassword.trim() || removing}
              activeOpacity={0.7}
            >
              {removing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.drawerRemoveText}>移除</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Password verification modal (for backup) */}
      <Modal visible={showPasswordModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => Keyboard.dismiss()}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>验证钱包密码</Text>
            <Text style={styles.modalDesc}>为保障资产安全，请输入钱包密码以确认身份</Text>
            <TextInput
              style={[styles.modalInput, passwordError ? styles.modalInputError : null]}
              value={backupPassword}
              onChangeText={(text) => { setBackupPassword(text); setPasswordError(""); }}
              placeholder="请输入钱包密码"
              placeholderTextColor="#C8C9CC"
              secureTextEntry
              autoFocus
              returnKeyType="go"
              onSubmitEditing={async () => {
                if (!walletId || !backupPassword.trim()) return;
                setVerifying(true);
                setPasswordError("");
                try {
                  const verified = await walletService.verifyWalletPassword(walletId, backupPassword.trim());
                  if (verified) {
                    setShowPasswordModal(false);
                    navigation.navigate("BackupGuide", { walletId: wallet.id, source: "detail" });
                  } else {
                    setShowPasswordModal(false);
                    setPasswordErrorContext("backup");
                    setShowPasswordErrorDialog(true);
                  }
                } catch {
                  setShowPasswordModal(false);
                  setPasswordErrorContext("backup");
                  setShowPasswordErrorDialog(true);
                }
                setVerifying(false);
              }}
            />
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowPasswordModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, (!backupPassword.trim() || verifying) ? styles.modalConfirmBtnDisabled : null]}
                onPress={async () => {
                  if (!walletId || !backupPassword.trim()) return;
                  setVerifying(true);
                  setPasswordError("");
                try {
                  const verified = await walletService.verifyWalletPassword(walletId, backupPassword.trim());
                  if (verified) {
                    setShowPasswordModal(false);
                    navigation.navigate("BackupGuide", { walletId: wallet.id, source: "detail" });
                  } else {
                    setShowPasswordModal(false);
                    setPasswordErrorContext("backup");
                    setShowPasswordErrorDialog(true);
                  }
                } catch {
                  setShowPasswordModal(false);
                  setPasswordErrorContext("backup");
                  setShowPasswordErrorDialog(true);
                }                  setVerifying(false);
                }}
                disabled={!backupPassword.trim() || verifying}
                activeOpacity={0.7}
              >
                {verifying ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>确认</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Password error dialog (forgot password / retry) */}
      <Modal visible={showPasswordErrorDialog} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowPasswordErrorDialog(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>密码不正确</Text>
            <Text style={styles.modalDesc}>请重试，或通过"忘记密码"选项重置密码。</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowPasswordErrorDialog(false);
                  navigation.navigate("ForgotPassword", { walletId: wallet.id });
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>忘记密码?</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => {
                  setShowPasswordErrorDialog(false);
                  if (passwordErrorContext === "remove") {
                    setRemovePassword("");
                    setRemovePasswordError("");
                    setShowRemoveDrawer(true);
                  } else {
                    setBackupPassword("");
                    setPasswordError("");
                    setShowPasswordModal(true);
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalConfirmText}>重试</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit alias modal */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>修改钱包名称</Text>
            <Text style={styles.modalDesc}>输入的名称不超过12个英文字符</Text>
            <TextInput
              style={styles.modalInput}
              value={editAlias}
              onChangeText={setEditAlias}
              placeholder="输入钱包名称"
              placeholderTextColor="#C8C9CC"
              maxLength={12}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowEditModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirmEditAlias}
                disabled={savingAlias || !editAlias.trim()}
                activeOpacity={0.7}
              >
                {savingAlias ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>确认</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F6F8",
  },
  // Toast
  toastWrap: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toast: {
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  // Info card
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoLabel: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  infoValue: {
    fontSize: 14,
    color: "#1F2937",
    fontWeight: "500",
    lineHeight: 20,
  },
  infoRightWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowIcon: {
    padding: 4,
  },
  identifierWrap: {
    maxWidth: "70%",
  },
  identifierText: {
    fontSize: 12,
    color: "#1F2937",
    fontFamily: "monospace",
    fontWeight: "500",
    textAlign: "right",
    lineHeight: 18,
  },
  infoDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
  },
  hintRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hintHidden: {
    fontSize: 14,
    color: "#9CA3AF",
    letterSpacing: 2,
  },
  notBackedUpLink: {
    fontSize: 14,
    color: "#3B82F6",
    fontWeight: "500",
  },
  backedUpText: {
    fontSize: 14,
    color: "#22C55E",
    fontWeight: "600",
  },
  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  addAccountLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addAccountLinkText: {
    fontSize: 13,
    color: "#3B82F6",
    fontWeight: "500",
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  accountIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
  },
  accountIconText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  accountInfo: {
    flex: 1,
    marginLeft: 12,
  },
  accountName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1F2937",
  },
  accountSymbol: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  actions: {
    marginTop: 24,
    gap: 10,
  },
  switchBtn: {
    backgroundColor: "#DBEAFE",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  switchBtnText: {
    color: "#3B82F6",
    fontSize: 15,
    fontWeight: "600",
  },
  // ── Drawer shared ──
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
    paddingBottom: 12,
  },
  // ── Confirm drawer ──
  confirmIconWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 12,
  },
  confirmDesc: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "left",
    lineHeight: 22,
    marginBottom: 24,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 12,
  },
  confirmCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  confirmCancelText: {
    color: "#6B7280",
    fontWeight: "600",
    fontSize: 15,
  },
  confirmRemoveBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#F65450",
    alignItems: "center",
  },
  confirmRemoveText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
  },
  // ── Password drawer ──
  drawerPasswordTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 24,
  },
  drawerInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: "#FFFFFF",
  },
  drawerInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: "#1F2937",
  },
  drawerEyeBtn: {
    padding: 14,
    paddingLeft: 4,
  },
  forgotPwdLink: {
    alignSelf: "flex-end",
    marginTop: 8,
    marginBottom: 24,
    paddingVertical: 4,
  },
  forgotPwdText: {
    fontSize: 13,
    color: "#3B82F6",
    fontWeight: "500",
  },
  drawerRemoveBtn: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#F65450",
    alignItems: "center",
  },
  drawerRemoveBtnDisabled: {
    backgroundColor: "#FCA5A5",
  },
  drawerRemoveText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
  // ── Modal shared ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#1F2937",
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  modalCancelText: {
    color: "#6B7280",
    fontWeight: "600",
  },
  modalConfirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
    alignItems: "center",
  },
  modalConfirmText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  errorText: {
    fontSize: 12,
    color: "#EF4444",
    marginBottom: 12,
    marginTop: 4,
  },
  modalInputError: {
    borderColor: "#EF4444",
  },
  modalConfirmBtnDisabled: {
    backgroundColor: "#93C5FD",
  },
});
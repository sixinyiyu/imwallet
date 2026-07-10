import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useKeyboardHeight } from "../hooks/useKeyboardHeight";
import EmptyState from "../components/EmptyState";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { WalletDetailSkeleton } from "../components/Skeleton";
import { useAlert } from "../hooks/useAlert";
import { walletService } from "../services/walletService";
import { localWalletService } from "../services/localWalletService";
import {
  WalletIcon,
  PlusCircleIcon,
  EditIcon,
  EyeOffIcon,
  EyeIcon,
  WarningIcon,
  TronIcon,
  EthIcon,
  BtcIcon,
  CopyIcon,
} from "../components/icons";
import type { Wallet, SimpleWallet } from "../types";
import { formatDate } from "../utils/date";
import { copyToClipboard } from "../utils/clipboard";
import { getErrorMessage } from "../utils/format";

/** 根据网络名获取对应图标组件（PascalCase） */
function getNetworkIcon(network: string): React.FC<{ size?: number; color?: string }> | null {
  if (network === "Tron") return TronIcon;
  if (network === "Ethereum") return EthIcon;
  if (network === "Bitcoin") return BtcIcon;
  return null;
}

type Nav = NativeStackNavigationProp<RootStackParamList, "WalletDetail">;
type RouteType = RouteProp<RootStackParamList, "WalletDetail">;



export default function WalletDetailScreen() {
  const { animatedY: removeKbY } = useKeyboardHeight(true);
  const { animatedY: backupKbY } = useKeyboardHeight(true);
  const { animatedY: editKbY } = useKeyboardHeight(true);
  const alert = useAlert();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;
  const { wallets, accounts, fetchAccounts, deleteWallet, verifyPassword } = useWalletStore();

  const [detail, setDetail] = useState<SimpleWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHint, setShowHint] = useState(false);

  // Edit alias modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAlias, setEditAlias] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);

  // Remove wallet: Step 1 = confirm drawer, Step 2 = password drawer
  const [showConfirmDrawer, setShowConfirmDrawer] = useState(false);
  const [showRemoveDrawer, setShowRemoveDrawer] = useState(false);
  const [showNotBackedUpDrawer, setShowNotBackedUpDrawer] = useState(false);
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
  const backedUpWallets = useWalletStore((s) => s.backedUpWallets);
  const walletIsBackedUp = walletId ? backedUpWallets.has(walletId) : false;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  // Set header right: "移除" link (普通钱包) / "取消订阅" link (只读钱包)
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => {
        if (wallet?.isReadOnly) {
          return (
            <TouchableOpacity
              onPress={async () => {
                try {
                  await useWalletStore.getState().unsubscribeWallet(wallet.id);
                  navigation.goBack();
                } catch (err: unknown) {
                  showToast(getErrorMessage(err, "取消订阅失败"));
                }
              }}
              style={{ marginRight: 16 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={{ color: "#6B7280", fontSize: 15, fontWeight: "500" }}>取消订阅</Text>
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity
            onPress={() => {
              // 未备份钱包：提示先备份
              if (!walletIsBackedUp) {
                setShowNotBackedUpDrawer(true);
              } else {
                setShowConfirmDrawer(true);
              }
            }}
            style={{ marginRight: 16 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: "#EF4444", fontSize: 15, fontWeight: "500" }}>移除</Text>
          </TouchableOpacity>
        );
      },
    });
  }, [navigation, walletIsBackedUp, wallet?.isReadOnly]);

  useEffect(() => {
    loadDetail();
  }, [walletId]);

  const loadDetail = async () => {
    if (!walletId) return;
    try {
      const data = await walletService.getWalletDetail(walletId);
      // 数据源策略：本地优先，服务端只补充余额
      // 钱包基本信息（name/source/createdAt/passwordHint 等）全用本地，服务端仅叠加余额
      const merged: Wallet = {
        ...walletFromStore!,
        updatedAt: data.updatedAt || "",
        tokenBalances: data.tokenBalances || [],
        totalBalanceCny: data.totalBalanceCny || "0",
      };
      setDetail(merged);
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

  const handleOpenEditAlias = () => {
    setEditAlias(wallet?.name || "");
    setShowEditModal(true);
  };

  const handleConfirmEditAlias = async () => {
    if (!walletId || !editAlias.trim()) return;
    setSavingAlias(true);
    try {
      await localWalletService.updateWallet(walletId, { name: editAlias.trim() });
      // 写库成功后直接更新内存，不再 fetchWallets 查库
      const currentWallets = useWalletStore.getState().wallets;
      const updatedWallets = currentWallets.map((w) =>
        w.id === walletId ? { ...w, name: editAlias.trim() } : w
      );
      const currentActive = useWalletStore.getState().activeWallet;
      const updatedActive = currentActive?.id === walletId
        ? { ...currentActive, name: editAlias.trim() }
        : currentActive;
      useWalletStore.setState({ wallets: updatedWallets, activeWallet: updatedActive });
      setDetail(null);
      setShowEditModal(false);
    } catch (err: unknown) {
      alert("提示", getErrorMessage(err, "修改失败"));
    }
    setSavingAlias(false);
  };

  const handleRemoveWallet = async () => {
    if (!wallet || !walletId || !removePassword.trim()) return;
    setRemoving(true);
    setRemovePasswordError("");
    try {
      const verified = await verifyPassword(walletId, removePassword.trim());
      if (verified) {
        await deleteWallet(wallet.id);
        setShowRemoveDrawer(false);
        // 删除最后一个钱包后跳转到 Start 导航页
        const remaining = useWalletStore.getState().wallets;
        if (remaining.length === 0) {
          navigation.replace("Start");
        } else {
          navigation.goBack();
        }
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
    return <WalletDetailSkeleton />;
  }

  if (!wallet) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>钱包不存在</Text>
      </View>
    );
  }

  const passwordHint = wallet.passwordHint;

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Wallet info card */}
        <View style={styles.infoCard}>
          {/* 名称 */}
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <WalletIcon size={18} color="#287220" />
              <Text style={styles.infoLabel}>名称</Text>
            </View>
            <View style={styles.infoRightWithIcon}>
              <Text style={styles.infoValue}>{wallet.name}</Text>
              <TouchableOpacity onPress={handleOpenEditAlias} activeOpacity={0.6} style={styles.rowIcon}>
                <EditIcon size={18} color="#8899B8" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.infoDivider} />

          {/* 标识符 */}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, styles.identifierLabel]}>标识符</Text>
            <TouchableOpacity
              onPress={async () => {
                const ok = await copyToClipboard(wallet.id);
                showToast(ok ? "标识符已复制" : "复制失败");
              }}
              activeOpacity={0.6}
              style={styles.identifierValueWrap}
            >
              <Text style={styles.identifierValue} numberOfLines={2} ellipsizeMode="middle" selectable>
                {wallet.id}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.infoDivider} />

          {/* 账户数 */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>账户数</Text>
            <Text style={styles.infoValue}>{accounts.length}</Text>
          </View>
          <View style={styles.infoDivider} />

          {/* 来源 */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>来源</Text>
            <Text style={styles.infoValue}>{wallet.source === "CREATE" ? "创建" : wallet.source === "IMPORT" ? "导入" : wallet.source === "SUBSCRIBE" ? "订阅" : wallet.source}</Text>
          </View>
          <View style={styles.infoDivider} />

          {/* 备份状态 */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>备份状态</Text>
            {wallet.isReadOnly ? (
              <Text style={styles.noBackupNeededText}>无需备份</Text>
            ) : walletIsBackedUp ? (
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

          {/* 密码提示（订阅钱包不显示） */}
          {!wallet.isReadOnly && passwordHint !== undefined && passwordHint !== null && (
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
          {!wallet.isReadOnly && (
            <TouchableOpacity
              style={styles.addAccountLink}
              onPress={() => navigation.navigate("WalletAddAccount", { walletId: wallet.id })}
              activeOpacity={0.6}
            >
              <PlusCircleIcon size={18} color="#287220" />
              <Text style={styles.addAccountLinkText}>添加账户</Text>
            </TouchableOpacity>
          )}
        </View>

        {accounts.length === 0 ? (
          <EmptyState message="暂无账户" />
        ) : (
          accounts.map((acc) => (
            <View key={acc.id} style={styles.accountCard}>
              <View style={styles.accountIconRow}>
                {(() => {
                  const IconComp = getNetworkIcon(acc.chain);
                  return IconComp ? <IconComp size={28} /> : null;
                })()}
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.accountName}>{acc.name}</Text>
                <View style={styles.accountAddressRow}>
                  <Text style={styles.accountSymbol} numberOfLines={1} ellipsizeMode="middle">
                    {acc.address}
                  </Text>
                  <TouchableOpacity
                    onPress={async () => {
                       const ok = await copyToClipboard(acc.address);
                       showToast(ok ? "地址已复制" : "复制失败");
                    }}
                    activeOpacity={0.6}
                    style={styles.accountCopyBtn}
                  >
                    <CopyIcon size={14} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
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

      {/* ── Not backed up warning drawer ── */}
      <Modal
        visible={showNotBackedUpDrawer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotBackedUpDrawer(false)}
      >
        <Pressable style={styles.drawerOverlay} onPress={() => setShowNotBackedUpDrawer(false)}>
          <Pressable style={styles.drawerContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.confirmIconWrap}>
              <WarningIcon size={48} color="#F59E0B" />
            </View>
            <Text style={styles.confirmTitle}>钱包未备份</Text>
            <Text style={styles.confirmDesc}>
              该钱包尚未备份助记词，移除后将无法恢复，可能导致资产永久丢失。请先完成备份后再移除钱包。
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setShowNotBackedUpDrawer(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: "#287220" }]}
                onPress={() => {
                  setShowNotBackedUpDrawer(false);
                  setBackupPassword("");
                  setPasswordError("");
                  setShowPasswordModal(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalConfirmText}>去备份</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
        {Platform.OS === "ios" ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
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
          </ScrollView>
        </KeyboardAvoidingView>
        ) : (
        <View style={styles.drawerOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowRemoveDrawer(false)} />
          <Animated.View style={{ transform: [{ translateY: removeKbY }] }}>
          <View style={styles.drawerContent}>
            <Text style={styles.drawerPasswordTitle}>密码</Text>
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
          </View>
          </Animated.View>
        </View>
        )}
      </Modal>

      {/* Password verification modal (for backup) */}
      <Modal visible={showPasswordModal} transparent animationType="fade">
        {Platform.OS === "ios" ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
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
                  const verified = await verifyPassword(walletId, backupPassword.trim());
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
                  const verified = await verifyPassword(walletId, backupPassword.trim());
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
          </ScrollView>
        </KeyboardAvoidingView>
        ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.modalOverlay} onPress={() => Keyboard.dismiss()}>
          <Animated.View style={[styles.modalCard, { transform: [{ translateY: backupKbY }] }]}>
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
                  const verified = await verifyPassword(walletId, backupPassword.trim());
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
                  const verified = await verifyPassword(walletId, backupPassword.trim());
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
          </Animated.View>
        </Pressable>
          </ScrollView>
        </View>
        )}
      </Modal>
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
        {Platform.OS === "ios" ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
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
          </ScrollView>
        </KeyboardAvoidingView>
        ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalCard, { transform: [{ translateY: editKbY }] }]}>
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
          </Animated.View>
        </View>
          </ScrollView>
        </View>
        )}
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
  infoDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
  },
  // 标识符行（标签占30%，值区域占70%，CopyIcon跟在文本后面）
  identifierLabel: {
    marginRight: "30%",
  },
  identifierValueWrap: {
    flex: 1,
  },
  identifierValue: {
    fontSize: 13,
    color: "#6B7280",
    fontFamily: "monospace",
    lineHeight: 18,
    textAlign: "right",
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
  noBackupNeededText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "500",
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
    color: "#287220",
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
  accountIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 36,
    justifyContent: "center",
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
    flex: 1,
    marginRight: 4,
  },
  accountAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  accountCopyBtn: {
    padding: 4,
    flexShrink: 0,
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
    backgroundColor: "#287220",
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
    backgroundColor: "#A5D6A7",
  },
});
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from "react-native";
import { localAddressService } from "../services/localAddressService";
import { useAlert } from "../hooks/useAlert";
import { detectNetwork } from "../utils/address";
import { TronIcon, EthIcon, BtcIcon, ContactIcon, CopyIcon, AddContactIcon } from "../components/icons";
// saveLogToLocal removed — not a core interface
import { getErrorMessage } from "../utils/format";
import { copyToClipboard } from "../utils/clipboard";
import { AddressBookSkeleton } from "../components/Skeleton";
import type { AddressEntry } from "../types";
import EmptyState from "../components/EmptyState";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";

/** 联系人表单模式：新增 / 编辑 */
type FormMode = "add" | "edit";

/** 根据网络类型渲染对应图标 */
function NetworkIcon({ network, size = 20 }: { network: string; size?: number }) {
  if (!network) return <ContactIcon size={size} color="#6B7280" />;
  switch (network) {
    case "Tron": return <TronIcon size={size} />;
    case "Ethereum":  return <EthIcon size={size} />;
    case "Bitcoin":  return <BtcIcon size={size} />;
    default:     return <ContactIcon size={size} color="#6B7280" />;
  }
}

export default function AddressBookScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const alert = useAlert();
  const [contacts, setContacts] = useState<AddressEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2000);
  }, []);

  // 表单状态
  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("add");
  const [, setEditingEntry] = useState<AddressEntry | null>(null);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formMemo, setFormMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 删除确认弹窗
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<AddressEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 根据地址自动推导网络类型
  const detectedNetwork = useMemo(() => detectNetwork(formAddress), [formAddress]);

  useEffect(() => {
    loadContacts();
  }, []);

  // 导航栏右上角：添加联系人按钮
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={openAddForm}
          style={{ marginRight: 16 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <AddContactIcon size={22} color="#374151" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const data = await localAddressService.getAllContacts();
      setContacts(data);
    } catch {
      // 地址本加载失败不影响核心功能
    }
    setLoading(false);
  };

  /** 打开新增表单 */
  const openAddForm = () => {
    setFormMode("add");
    setEditingEntry(null);
    setFormName("");
    setFormAddress("");
    setFormMemo("");
    setFormVisible(true);
  };

  /** 打开编辑表单 */
  const openEditForm = (entry: AddressEntry) => {
    setFormMode("edit");
    setEditingEntry(entry);
    setFormName(entry.name);
    setFormAddress(entry.address);
    setFormMemo(entry.memo || "");
    setFormVisible(true);
  };

  /** 关闭表单 */
  const closeForm = () => {
    setFormVisible(false);
    setFormName("");
    setFormAddress("");
    setFormMemo("");
    setEditingEntry(null);
  };

  /** 提交表单（新增或编辑） */
  const handleSubmit = async () => {
    if (!formName.trim() || !formAddress.trim()) {
      alert("提示", "请填写名称和地址");
      return;
    }
    if (!detectedNetwork) {
      alert("提示", "无法识别地址格式，请输入有效的链上地址 (T.../0x.../1...)");
      return;
    }
    setSubmitting(true);
    try {
      // upsertAddress 天然支持新增和编辑（REPLACE 策略）
      await localAddressService.upsertAddress({
        chain: detectedNetwork,
        address: formAddress.trim(),
        name: formName.trim(),
        type: "contact",
        status: "unverified",
        memo: formMemo.trim(),
      });
      showToast(formMode === "add" ? "联系人已添加" : "联系人已更新");
      closeForm();
      loadContacts();
    } catch (err: unknown) {
      alert("错误", getErrorMessage(err, "操作失败"));
    } finally {
      setSubmitting(false);
    }
  };

  /** 删除联系人 */
  const handleDelete = (entry: AddressEntry) => {
    setDeletingEntry(entry);
    setShowDeleteConfirm(true);
  };

  /** 复制地址到剪贴板 */
  const handleCopyAddress = useCallback(async (address: string) => {
    const ok = await copyToClipboard(address);
    showToast(ok ? "地址已复制" : "复制失败");
  }, [showToast]);

  if (loading && contacts.length === 0) {
    return <AddressBookSkeleton count={4} />;
  }

  return (
    <View style={styles.container}>
      {/* 联系人列表 */}
      <FlatList
        data={contacts}
        keyExtractor={(item) => `${item.chain}_${item.address}`}
        refreshing={loading}
        onRefresh={loadContacts}
        renderItem={({ item }) => (
          <View style={styles.contactItem}>
            {/* 左侧：网络icon */}
            <View style={styles.contactIconWrap}>
              <NetworkIcon network={item.chain} size={28} />
            </View>

            {/* 右侧：名称 + 地址 + 操作链接 */}
            <View style={styles.contactInfo}>
              {/* 第一行：名称 + 网络类型badge */}
              <View style={styles.contactNameRow}>
                <Text style={styles.contactName} numberOfLines={1} ellipsizeMode="tail">
                  {item.name}
                </Text>
                <View style={styles.networkBadge}>
                  <Text style={styles.networkBadgeText}>{item.chain || "未知"}</Text>
                </View>
              </View>

              {/* 第二行：地址 + 复制icon */}
              <View style={styles.contactAddressRow}>
                  <Text style={styles.contactAddress} numberOfLines={1} ellipsizeMode="middle">
                    {item.address}
                  </Text>                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={() => handleCopyAddress(item.address)}
                  activeOpacity={0.6}
                >
                  <CopyIcon size={14} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {/* 第三行：备注(左) + 操作链接(右) */}
              <View style={styles.row3}>
                {item.memo ? (
                  <Text style={styles.memoText} numberOfLines={1} ellipsizeMode="tail">备注：{item.memo}</Text>
                ) : null}
                <View style={styles.row3Actions}>
                  <TouchableOpacity
                    onPress={() => openEditForm(item)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.linkText}>编辑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.linkTextDanger}>删除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState message="暂无联系人" />
        }
        contentContainerStyle={
          contacts.length === 0 ? styles.emptyList : undefined
        }
        ListFooterComponent={
          contacts.length > 0 ? (
            <Text style={styles.endHint}>— 已加载全部 —</Text>
          ) : null
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

      {/* 新增/编辑表单 Modal */}
      <Modal
        visible={formVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeForm}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <Text style={modalStyles.title}>
              {formMode === "add" ? "添加联系人" : "编辑联系人"}
            </Text>

            <Text style={modalStyles.label}>联系人名称</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="请输入名称"
              value={formName}
              onChangeText={setFormName}
            />

            <Text style={modalStyles.label}>链上地址</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="请输入链上地址 (如 T.../0x.../1...)"
              value={formAddress}
              onChangeText={setFormAddress}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            {/* 地址格式校验提示 */}
            {formAddress.trim() && (
              <View style={modalStyles.detectRow}>
                {!detectedNetwork ? (
                  <Text style={modalStyles.detectError}>✗ 无法识别地址格式</Text>
                ) : (
                  <View style={modalStyles.detectSuccess}>
                    <NetworkIcon network={detectedNetwork} size={20} />
                    <Text style={modalStyles.detectSuccessText}>
                      ✓ {detectedNetwork} 地址格式正确
                    </Text>
                  </View>
                )}
              </View>
            )}

            <Text style={modalStyles.label}>备注 (可选)</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="备注信息"
              value={formMemo}
              onChangeText={setFormMemo}
            />

            <View style={modalStyles.buttonRow}>
              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={closeForm}
                disabled={submitting}
              >
                <Text style={modalStyles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.submitBtn, submitting && modalStyles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={modalStyles.submitBtnText}>
                    {formMode === "add" ? "添加" : "保存"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <Text style={modalStyles.title}>确认删除</Text>
            <Text style={modalStyles.desc}>
              确定要删除联系人 "{deletingEntry?.name}" 吗？
            </Text>
            <View style={modalStyles.buttonRow}>
              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={() => { setShowDeleteConfirm(false); setDeletingEntry(null); }}
                activeOpacity={0.7}
              >
                <Text style={modalStyles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.submitBtn, { backgroundColor: "#EF4444" }, deleting && modalStyles.submitBtnDisabled]}
                onPress={async () => {
                  if (!deletingEntry) return;
                  setDeleting(true);
                  try {
                    await localAddressService.deleteAddress(deletingEntry.chain, deletingEntry.address);
                    showToast("联系人已删除");
                    setShowDeleteConfirm(false);
                    setDeletingEntry(null);
                    loadContacts();
                  } catch (err: unknown) {
                    showToast("删除失败: " + getErrorMessage(err, "未知错误"));
                    setShowDeleteConfirm(false);
                    setDeletingEntry(null);
                  }
                  setDeleting(false);
                }}
                disabled={deleting}
                activeOpacity={0.7}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={modalStyles.submitBtnText}>删除</Text>
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
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // ─── 卡片布局 ───
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  contactIconWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 36,
    justifyContent: "center",
    marginRight: 12,
  },
  contactInfo: {
    flex: 1,
  },
  // 第一行：名称 + 网络类型badge
  contactNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  contactName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1F2937",
    flex: 1,
  },
  networkBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    flexShrink: 0,
  },
  networkBadgeText: {
    fontSize: 11,
    color: "#287220",
    fontWeight: "500",
  },
  // 第二行：地址 + 复制icon
  contactAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  contactAddress: {
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: "monospace",
    flex: 1,
    marginRight: 4,
  },
  copyBtn: {
    padding: 4,
    flexShrink: 0,
  },
  // 第三行：备注(左) + 操作链接(右)
  row3: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  memoText: {
    fontSize: 12,
    color: "#9CA3AF",
    flex: 1,
  },
  row3Actions: {
    flexDirection: "row",
    gap: 16,
  },
  linkText: {
    fontSize: 13,
    color: "#287220",
    fontWeight: "500",
  },
  linkTextDanger: {
    fontSize: 13,
    color: "#EF4444",
    fontWeight: "500",
  },
  // Toast
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
  emptyList: { flexGrow: 1 },
  endHint: { textAlign: "center", paddingVertical: 20, fontSize: 13, color: "#D1D5DB" },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 20,
  },
  desc: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
    color: "#1F2937",
  },
  detectRow: {
    marginBottom: 16,
  },
  detectError: {
    fontSize: 13,
    color: "#EF4444",
    fontWeight: "500",
  },
  detectSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detectSuccessText: {
    fontSize: 13,
    color: "#10B981",
    fontWeight: "500",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  cancelBtn: {
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 14,
    flex: 1,
    marginRight: 12,
    alignItems: "center",
  },
  cancelBtnText: { color: "#6B7280", fontWeight: "600", fontSize: 15 },
  submitBtn: {
    backgroundColor: "#287220",
    borderRadius: 10,
    padding: 14,
    flex: 1,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
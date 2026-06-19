import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { contactService } from "../services/contactService";
import type { Contact } from "../types";
import EmptyState from "../components/EmptyState";

/** 联系人表单模式：新增 / 编辑 */
type FormMode = "add" | "edit";

/** 支持的链类型 */
const NETWORK_OPTIONS = ["TRON", "EVM", "BTC"];
const NETWORK_LABELS: Record<string, string> = {
  TRON: "TRON",
  EVM: "EVM (Ethereum)",
  BTC: "Bitcoin",
};

export default function AddressBookScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  // 表单状态
  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("add");
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formNetwork, setFormNetwork] = useState("TRON");
  const [formMemo, setFormMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const data = await contactService.getContacts();
      setContacts(data);
    } catch {
      // silent
    }
    setLoading(false);
  };

  /** 打开新增表单 */
  const openAddForm = () => {
    setFormMode("add");
    setEditingContact(null);
    setFormName("");
    setFormAddress("");
    setFormNetwork("TRON");
    setFormMemo("");
    setFormVisible(true);
  };

  /** 打开编辑表单 */
  const openEditForm = (contact: Contact) => {
    setFormMode("edit");
    setEditingContact(contact);
    setFormName(contact.name);
    setFormAddress(contact.address);
    setFormNetwork(contact.network || "TRON");
    setFormMemo(contact.memo || "");
    setFormVisible(true);
  };

  /** 关闭表单 */
  const closeForm = () => {
    setFormVisible(false);
    setFormName("");
    setFormAddress("");
    setFormNetwork("TRON");
    setFormMemo("");
    setEditingContact(null);
  };

  /** 提交表单（新增或编辑） */
  const handleSubmit = async () => {
    if (!formName.trim() || !formAddress.trim()) {
      Alert.alert("提示", "请填写名称和地址");
      return;
    }
    setSubmitting(true);
    try {
      if (formMode === "add") {
        await contactService.createContact({
          name: formName.trim(),
          address: formAddress.trim(),
          network: formNetwork,
          memo: formMemo.trim() || undefined,
        });
        Alert.alert("成功", "联系人已添加");
      } else if (formMode === "edit" && editingContact) {
        await contactService.updateContact(editingContact.id, {
          name: formName.trim(),
          address: formAddress.trim(),
          network: formNetwork,
          memo: formMemo.trim() || undefined,
        });
        Alert.alert("成功", "联系人已更新");
      }
      closeForm();
      loadContacts();
    } catch (err: any) {
      Alert.alert("错误", err.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  /** 删除联系人 */
  const handleDelete = (contact: Contact) => {
    Alert.alert("确认删除", `确定要删除联系人 "${contact.name}" 吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            await contactService.deleteContact(contact.id);
            loadContacts();
          } catch (err: any) {
            Alert.alert("错误", err.message || "删除失败");
          }
        },
      },
    ]);
  };

  if (loading && contacts.length === 0) {
    return (
      <View style={styles.centerLoading}>
        <ActivityIndicator size="large" color="#287220" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 添加按钮 */}
      <TouchableOpacity style={styles.addButton} onPress={openAddForm}>
        <Text style={styles.addButtonText}>+ 添加联系人</Text>
      </TouchableOpacity>

      {/* 联系人列表 */}
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={loadContacts}
        renderItem={({ item }) => (
          <View style={styles.contactItem}>
            <View style={styles.contactIconWrap}>
              <Text style={styles.contactIcon}>👤</Text>
            </View>
            <View style={styles.contactInfo}>
              <View style={styles.contactNameRow}>
                <Text style={styles.contactName}>{item.name}</Text>
                <View style={styles.networkBadge}>
                  <Text style={styles.networkBadgeText}>{item.network}</Text>
                </View>
              </View>
              <Text style={styles.contactAddress}>
                {item.address.length > 22
                  ? `${item.address.slice(0, 14)}...${item.address.slice(-8)}`
                  : item.address}
              </Text>
              {item.memo && (
                <Text style={styles.contactMemo}>{item.memo}</Text>
              )}
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => openEditForm(item)}
              >
                <Text style={styles.editBtnText}>编辑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(item)}
              >
                <Text style={styles.deleteBtnText}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState message="暂无联系人" />
        }
        contentContainerStyle={
          contacts.length === 0 ? styles.emptyList : undefined
        }
      />

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

            <Text style={modalStyles.label}>链类型</Text>
            <View style={modalStyles.networkRow}>
              {NETWORK_OPTIONS.map((net) => (
                <TouchableOpacity
                  key={net}
                  style={[
                    modalStyles.networkOption,
                    formNetwork === net && modalStyles.networkOptionActive,
                  ]}
                  onPress={() => setFormNetwork(net)}
                >
                  <Text
                    style={[
                      modalStyles.networkOptionText,
                      formNetwork === net && modalStyles.networkOptionTextActive,
                    ]}
                  >
                    {NETWORK_LABELS[net]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={modalStyles.label}>链上地址</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="请输入链上地址 (如 T.../0x.../1...)"
              value={formAddress}
              onChangeText={setFormAddress}
              autoCapitalize="none"
              autoCorrect={false}
            />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  addButton: {
    backgroundColor: "#287220",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  addButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  contactItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  contactIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  contactIcon: { fontSize: 18 },
  contactInfo: { flex: 1 },
  contactNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  contactName: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  networkBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  networkBadgeText: {
    fontSize: 11,
    color: "#3B82F6",
    fontWeight: "500",
  },
  contactAddress: {
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "monospace",
    marginTop: 4,
  },
  contactMemo: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  actionButtons: { flexDirection: "row", gap: 8 },
  editBtn: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editBtnText: { color: "#287220", fontWeight: "500", fontSize: 13 },
  deleteBtn: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteBtnText: { color: "#EF4444", fontWeight: "500", fontSize: 13 },
  emptyList: { flexGrow: 1 },
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
    marginBottom: 16,
    color: "#1F2937",
  },
  networkRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  networkOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  networkOptionActive: {
    borderColor: "#287220",
    backgroundColor: "#E8F5E9",
  },
  networkOptionText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  networkOptionTextActive: {
    color: "#287220",
    fontWeight: "600",
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

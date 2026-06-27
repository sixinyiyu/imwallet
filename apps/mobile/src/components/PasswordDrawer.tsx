import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

interface PasswordDrawerProps {
  visible: boolean;
  title: string;
  description?: string;
  error?: string | null;
  verifying: boolean;
  onConfirm: (password: string) => void;
  onClose: () => void;
}

/**
 * 通用密码输入抽屉组件
 * 用于 SettingsScreen、ConfigManageScreen 等需要密码验证的场景
 */
export default function PasswordDrawer({
  visible,
  title,
  description,
  error,
  verifying,
  onConfirm,
  onClose,
}: PasswordDrawerProps) {
  const [pwdInput, setPwdInput] = React.useState("");

  const handleConfirm = () => {
    if (!pwdInput.trim()) return;
    onConfirm(pwdInput.trim());
  };

  const handleClose = () => {
    setPwdInput("");
    onClose();
  };

  // 每次打开时清空输入
  React.useEffect(() => {
    if (visible) setPwdInput("");
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.drawerOverlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.drawerBackdrop} onPress={handleClose} />
        <View style={styles.drawerContent}>
          <View style={styles.drawerHandle} />
          <Text style={styles.drawerTitle}>{title}</Text>
          {description && <Text style={styles.drawerDesc}>{description}</Text>}
          <TextInput
            style={styles.pwdInput}
            value={pwdInput}
            onChangeText={setPwdInput}
            placeholder="请输入密码"
            placeholderTextColor="#C8C9CC"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={handleConfirm}
          />
          {error && <Text style={styles.pwdError}>{error}</Text>}
          <View style={styles.drawerActions}>
            <TouchableOpacity
              style={styles.drawerCancelBtn}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={styles.drawerCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.drawerConfirmBtn, verifying && styles.drawerConfirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={verifying || !pwdInput.trim()}
              activeOpacity={0.7}
            >
              {verifying ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.drawerConfirmText}>确认</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  drawerOverlay: { flex: 1, justifyContent: "flex-end" },
  drawerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  drawerContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    paddingTop: 12,
  },
  drawerHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20,
  },
  drawerTitle: { fontSize: 17, fontWeight: "600", color: "#1F2937", marginBottom: 8 },
  drawerDesc: { fontSize: 13, color: "#9CA3AF", marginBottom: 16 },
  pwdInput: {
    borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: "#1F2937",
  },
  pwdError: { fontSize: 13, color: "#EF4444", marginTop: 8 },
  drawerActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  drawerCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: "#F3F4F6", alignItems: "center",
  },
  drawerCancelText: { color: "#6B7280", fontWeight: "600", fontSize: 15 },
  drawerConfirmBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: "#287220", alignItems: "center",
  },
  drawerConfirmBtnDisabled: { opacity: 0.6 },
  drawerConfirmText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});

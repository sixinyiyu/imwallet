import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from "react-native";
import { WarningIcon } from "./icons";

interface Props {
  visible: boolean;
  onClose: () => void;
  onBackup: () => void;
}

/**
 * 备份提示弹窗 — 未备份钱包执行转账/收款等操作时弹出
 * 提示用户先备份助记词，否则资产可能永久丢失
 */
export default function BackupGuardModal({ visible, onClose, onBackup }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
          <View style={s.iconWrap}>
            <WarningIcon size={48} color="#F59E0B" />
          </View>
          <Text style={s.title}>钱包未备份</Text>
          <Text style={s.desc}>
            该钱包尚未备份助记词。未备份的钱包在设备丢失或应用卸载后无法恢复，可能导致资产永久丢失。请先完成备份再进行操作。
          </Text>
          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={s.cancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.backupBtn} onPress={onBackup} activeOpacity={0.7}>
              <Text style={s.backupText}>去备份</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
  },
  iconWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 12,
  },
  desc: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "left",
    lineHeight: 22,
    marginBottom: 24,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  cancelText: {
    color: "#6B7280",
    fontWeight: "600",
    fontSize: 15,
  },
  backupBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#287220",
    alignItems: "center",
  },
  backupText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
  },
});

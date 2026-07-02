import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from "react-native";
import { WarningIcon } from "./icons";
import type { GuardType } from "../hooks/useBackupGuard";

interface Props {
  visible: boolean;
  guardType: GuardType;
  onClose: () => void;
  onBackup: () => void;
}

/**
 * 备份提示弹窗 — 两种模式：
 * - backup: 未备份的本地钱包，提示先备份助记词
 * - readonly: 订阅钱包（只读），提示无法执行转账操作
 */
export default function BackupGuardModal({ visible, guardType, onClose, onBackup }: Props) {
  const isReadonly = guardType === "readonly";

  const title = isReadonly ? "只读钱包" : "钱包未备份";
  const desc = isReadonly
    ? "该钱包为订阅钱包（只读），无法执行转账操作。订阅钱包仅可查看余额和收款地址。"
    : "该钱包尚未备份助记词。未备份的钱包在设备丢失或应用卸载后无法恢复，可能导致资产永久丢失。请先完成备份再进行操作。";
  const actionLabel = isReadonly ? null : "去备份";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
          <View style={s.iconWrap}>
            <WarningIcon size={48} color="#F59E0B" />
          </View>
          <Text style={s.title}>{title}</Text>
          <Text style={s.desc}>{desc}</Text>
          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={s.cancelText}>我知道了</Text>
            </TouchableOpacity>
            {!isReadonly && (
              <TouchableOpacity style={s.backupBtn} onPress={onBackup} activeOpacity={0.7}>
                <Text style={s.backupText}>{actionLabel}</Text>
              </TouchableOpacity>
            )}
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

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import * as SecureStore from "../utils/secureStorage";
import { generateMnemonic } from "../utils/mnemonic";
import { uploadLog, saveLogToLocal } from "../services/logService";
import { CameraIcon, NoScreenshotIcon } from "../components/icons";

type Nav = NativeStackNavigationProp<RootStackParamList, "BackupMnemonic">;
type RouteType = RouteProp<RootStackParamList, "BackupMnemonic">;

const MNEMONIC_KEY_PREFIX = "aquad_mnemonic_";
const HIDE_TIMEOUT = 60000;

/** Build per-wallet SecureStore key for mnemonic */
function mnemonicKey(walletId: string): string {
  return `${MNEMONIC_KEY_PREFIX}${walletId}`;
}

export default function BackupMnemonicScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;

  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [showWarningDrawer, setShowWarningDrawer] = useState(true);
  const [noMnemonic, setNoMnemonic] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, []);

  useEffect(() => {
    loadMnemonic();
  }, []);

  const loadMnemonic = async () => {
    if (!walletId) {
      saveLogToLocal("mnemonic", `[BackupMnemonic] walletId is null/undefined, cannot load mnemonic`);
      setNoMnemonic(true);
      return;
    }
    try {
      const key = mnemonicKey(walletId);
      let stored = await SecureStore.getItemAsync(key);
      saveLogToLocal("mnemonic", `[BackupMnemonic] step1 read perWallet key=${key}, result=${stored ? `len=${stored.length},prefix=${stored.slice(0, 8)}` : "null"}`);

      // Migration: check legacy key if per-wallet key not found
      if (!stored) {
        const legacy = await SecureStore.getItemAsync("aquad_mnemonic");
        saveLogToLocal("mnemonic", `[BackupMnemonic] step2 read legacy key, result=${legacy ? `len=${legacy.length},prefix=${legacy.slice(0, 8)}` : "null"}`);
        if (legacy) {
          const words = legacy.trim().split(/\s+/);
          if (words.length === 12) {
            stored = legacy;
            await SecureStore.setItemAsync(key, stored);
          }
          // Delete legacy key after migration
          await SecureStore.deleteItemAsync("aquad_mnemonic");
        }
      }

      // Validate word count
      if (stored) {
        const words = stored.trim().split(/\s+/);
        if (words.length !== 12) {
          saveLogToLocal("mnemonic", `[BackupMnemonic] invalid word count: ${words.length}, expected 12, walletId=${walletId}, prefix=${stored.slice(0, 20)}`);
          stored = null; // invalid, will regenerate below
        }
      }

      if (!stored) {
        saveLogToLocal("mnemonic", `[BackupMnemonic] step3 no stored mnemonic, calling generateMnemonic, walletId=${walletId}`);
        stored = await generateMnemonic();
        if (!stored || stored.trim().split(/\s+/).length !== 12) {
          saveLogToLocal("mnemonic", `[BackupMnemonic] generateMnemonic FAILED: result=${stored ? `len=${stored.length},words=${stored.trim().split(/\s+/).length},prefix=${stored.slice(0, 20)}` : "null/empty"}, walletId=${walletId}`);
        } else {
          saveLogToLocal("mnemonic", `[BackupMnemonic] generateMnemonic OK: words=12, prefix=${stored.slice(0, 20)}, walletId=${walletId}`);
        }
        await SecureStore.setItemAsync(key, stored);
        // Verify write succeeded by reading back
        const readBack = await SecureStore.getItemAsync(key);
        if (!readBack || readBack !== stored) {
          saveLogToLocal("mnemonic", `[BackupMnemonic] SecureStore write FAILED: readBack=${readBack ? `len=${readBack.length}` : "null"}, expected len=${stored.length}, walletId=${walletId}`);
        }
      }

      const finalWords = stored.trim().split(/\s+/);
      setMnemonic(finalWords);
      saveLogToLocal("mnemonic", `[BackupMnemonic] final: wordCount=${finalWords.length}, walletId=${walletId}`);
    } catch (err) {
      saveLogToLocal("mnemonic", `[BackupMnemonic] loadMnemonic FAILED: ${(err as Error)?.message || String(err)}, stack=${(err as Error)?.stack?.slice(0, 200) || "none"}, walletId=${walletId}`);
      setNoMnemonic(true);
    }
  };

  useEffect(() => {
    if (showMnemonic) {
      hideTimerRef.current = setTimeout(() => {
        setShowMnemonic(false);
        showToast("助记词已自动隐藏，请再次点击查看");
      }, HIDE_TIMEOUT);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showMnemonic]);

  const handleShowMnemonic = () => {
    setShowMnemonic(true);
  };

  const handleConfirmBackup = () => {
    if (!walletId) return;
    navigation.navigate("ConfirmMnemonic", { walletId, mnemonic: mnemonic.join(" ") });
  };

  if (noMnemonic) {
    return (
      <View style={styles.container}>
        <View style={styles.noMnemonicContent}>
          <Text style={styles.noMnemonicTitle}>暂无助记词</Text>
          <Text style={styles.noMnemonicDesc}>
            "该钱包通过密码方式创建，暂无本地助记词可备份。"
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.backBtnText}>返回</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>备份助记词</Text>
      <Text style={styles.subtitle}>请按顺序抄写助记词，确保备份正确</Text>
      {/* Debug: show word count for troubleshooting */}
      {mnemonic.length === 0 && <Text style={{ color: "#EF4444", fontSize: 12, marginBottom: 8 }}>⚠️ 助记词为空，walletId={walletId}</Text>}

      {!showMnemonic ? (
        <View style={styles.hiddenSection}>
          <CameraIcon size={48} color="#287220" />
          <Text style={styles.warningTitle}>请注意周围环境</Text>
          <Text style={styles.warningDesc}>
            为确保助记词安全，请在安全环境下查看，谨防他人窥探或拍照
          </Text>
          <TouchableOpacity style={styles.showBtn} onPress={handleShowMnemonic} activeOpacity={0.7}>
            <Text style={styles.showBtnText}>查看助记词</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mnemonicCard}>
          <View style={styles.mnemonicGrid}>
            {mnemonic.map((word, index) => (
              <View key={index} style={styles.wordCell}>
                <Text style={styles.wordIndex}>{index + 1}</Text>
                <Text style={styles.wordText}>{word}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.tipsSection}>
        <Text style={styles.tipText}>• 妥善保管助记词至隔离网络的安全地方。</Text>
        <Text style={styles.tipText}>• 请勿将助记词在联网环境下分享和存储，比如邮件、相册、社交应用等。</Text>
      </View>

      <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmBackup} activeOpacity={0.7}>
        <Text style={styles.confirmBtnText}>已确认备份</Text>
      </TouchableOpacity>

      {toastVisible && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        </View>
      )}

      <Modal
        visible={showWarningDrawer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWarningDrawer(false)}
      >
        <Pressable style={styles.drawerOverlay} onPress={() => setShowWarningDrawer(false)}>
          <View style={styles.drawerContent} onStartShouldSetResponder={() => true} onResponderTerminationRequest={() => false}>
            <TouchableOpacity style={styles.drawerClose} onPress={() => setShowWarningDrawer(false)} activeOpacity={0.6}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
            <NoScreenshotIcon size={48} color="#F59E0B" />
            <Text style={styles.drawerTitle}>请勿截屏</Text>
            <Text style={styles.drawerDesc}>
              请不要通过截屏的方式进行备份，这将会增加助记词被盗和丢失的风险。图库一旦被恶意软件窃取，将会造成资产损失。
            </Text>
            <TouchableOpacity style={styles.drawerAckBtn} onPress={() => setShowWarningDrawer(false)} activeOpacity={0.7}>
              <Text style={styles.drawerAckBtnText}>我知道了</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6F8", paddingHorizontal: 24, paddingTop: 24 },
  title: { fontSize: 20, fontWeight: "700", color: "#1F2937", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#6B7280", marginBottom: 24 },
  hiddenSection: {
    backgroundColor: "#FFFFFF", borderRadius: 12, padding: 24, alignItems: "center", marginBottom: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  warningTitle: { fontSize: 16, fontWeight: "600", color: "#1F2937", marginTop: 16, marginBottom: 8 },
  warningDesc: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 22, marginBottom: 20 },
  showBtn: { backgroundColor: "#287220", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center" },
  showBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  mnemonicCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  mnemonicGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  wordCell: {
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#F3F4F6",
  },
  wordIndex: { fontSize: 12, color: "#9CA3AF", fontWeight: "500" },
  wordText: { fontSize: 14, color: "#1F2937", fontWeight: "600", flex: 1 },
  tipsSection: { marginBottom: 24 },
  tipText: { fontSize: 13, color: "#6B7280", lineHeight: 20, marginBottom: 4 },
  confirmBtn: { backgroundColor: "#287220", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  confirmBtnText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  noMnemonicContent: { alignItems: "center", justifyContent: "center", flex: 1, paddingHorizontal: 24 },
  noMnemonicTitle: { fontSize: 18, fontWeight: "700", color: "#1F2937", marginBottom: 12 },
  noMnemonicDesc: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 22, marginBottom: 24 },
  backBtn: { backgroundColor: "#287220", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center" },
  backBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
  drawerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  drawerContent: {
    backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, alignItems: "center",
  },
  drawerClose: { position: "absolute", top: 16, left: 16, padding: 4 },
  drawerCloseText: { fontSize: 20, color: "#9CA3AF" },
  drawerTitle: { fontSize: 16, fontWeight: "600", color: "#1F2937", marginTop: 16, marginBottom: 8 },
  drawerDesc: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 22, marginBottom: 20 },
  drawerAckBtn: { backgroundColor: "#287220", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center" },
  drawerAckBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});
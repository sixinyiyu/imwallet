import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { detectNetwork } from "../utils/address";
import type { RootStackParamList } from "../types/navigation";
import { useAlert } from "../hooks/useAlert";

type Nav = NativeStackNavigationProp<RootStackParamList, "Scan">;

export default function ScanScreen() {
  const alert = useAlert();
  const navigation = useNavigation<Nav>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setScanned(false);
    }, [])
  );

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>需要相机权限来扫描二维码</Text>
        <View style={styles.permissionBtn} onTouchEnd={() => requestPermission()}>
          <Text style={styles.permissionBtnText}>授予权限</Text>
        </View>
      </View>
    );
  }

  const handleScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      // Try parsing our URI scheme: aquad://transfer?address=0x...
      if (data.startsWith("aquad://")) {
        const url = new URL(data);
        const address = url.searchParams.get("address");
        const token = url.searchParams.get("token") || undefined;
        const network = url.searchParams.get("network") || undefined;
        if (address) {
          navigation.replace("Transfer", { toAddress: address, tokenSymbol: token });
          return;
        }
      }

      // Try parsing as a plain address (TRON / EVM / BTC)
      const trimmed = data.trim();
      if (detectNetwork(trimmed)) {
        navigation.replace("Transfer", { toAddress: trimmed });
        return;
      }

      // Unknown format — ask user
      alert("扫描结果", data, [
        {
          text: "作为地址填入转账",
          onPress: () => navigation.replace("Transfer", { toAddress: data }),
        },
        { text: "取消", onPress: () => setScanned(false) },
      ]);
    } catch {
      alert("无法识别", "请扫描有效的钱包地址 QR 码");
      setScanned(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={scanned ? undefined : handleScanned}
      >
        <View style={styles.overlay}>
          {/* 关闭按钮 */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.overlayTop}>
            <Text style={styles.hintText}>将 QR 码对准取景框</Text>
          </View>
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.scanBox}>
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom} />
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#000" },
  permissionText: { color: "#fff", fontSize: 16, marginBottom: 24, textAlign: "center" },
  permissionBtn: { backgroundColor: "#3B82F6", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10 },
  permissionBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  camera: { flex: 1 },
  overlay: { flex: 1 },
  closeBtn: {
    position: "absolute",
    top: 56,
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { color: "#fff", fontSize: 20, fontWeight: "600" },
  overlayTop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayMiddle: { flexDirection: "row" },
  overlaySide: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  scanBox: {
    width: 240,
    height: 240,
    borderColor: "transparent",
    position: "relative",
  },
  cornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#3B82F6",
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: "#3B82F6",
    borderTopRightRadius: 8,
  },
  cornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#3B82F6",
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: "#3B82F6",
    borderBottomRightRadius: 8,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  hintText: { color: "#fff", fontSize: 16, fontWeight: "500" },
});
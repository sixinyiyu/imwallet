import React, { useMemo, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRoute, RouteProp } from "@react-navigation/native";
import QRCode from "react-native-qrcode-svg";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useWalletStore } from "../stores/walletStore";
import { useAlert } from "../hooks/useAlert";
import { ReceiveSkeleton } from "../components/Skeleton";
import { saveLogToLocal } from "../services/logService";
import { CopyIcon, ShareIcon, TronIcon, EthIcon, BtcIcon } from "../components/icons";
import type { RootStackParamList } from "../types/navigation";

type ReceiveRouteProp = RouteProp<RootStackParamList, "Receive">;

function renderNetworkIcon(network: string, size: number) {
  if (network === "Tron") return <TronIcon size={size} />;
  if (network === "Ethereum") return <EthIcon size={size} />;
  if (network === "Bitcoin") return <BtcIcon size={size} />;
  return null;
}

export default function ReceiveScreen() {
  const alert = useAlert();
  const route = useRoute<ReceiveRouteProp>();
  const { activeWallet, activeAccount, tokens } = useWalletStore();
  // 使用 Account.address（链上地址）而非 Wallet.address（内部标识）
  const address = activeAccount?.address ?? "";
  const network = activeAccount?.network ?? "";
  const qrWrapperRef = useRef<View>(null);

  // Show skeleton while wallet/account data is loading
  if (!address) {
    return <ReceiveSkeleton />;
  }

  const tokenSymbol = route.params?.tokenSymbol || "USDT";
  const tokenId = route.params?.tokenId;

  const currentToken = useMemo(() => {
    if (tokenId) {
      const found = tokens.find((t) => t.tokenId === tokenId);
      if (found) return found;
    }
    const found = tokens.find((t) => t.symbol === tokenSymbol);
    return found || { symbol: tokenSymbol, name: tokenSymbol };
  }, [tokens, tokenSymbol, tokenId]);

  const qrValue = useMemo(() => {
    if (!address) return "";
    return `aquad://transfer?address=${address}&token=${currentToken.symbol}&network=${network}`;
  }, [address, currentToken.symbol, network]);

  const handleCopy = () => {
    if (address) {
      try {
        const Clipboard = require("expo-clipboard");
        Clipboard.setStringAsync(address);
        alert("已复制", `${network} 收款地址已复制到剪贴板`);
      } catch (err: any) {
        saveLogToLocal("crash", `[Receive] handleCopy failed: ${err?.message || String(err)}`);
        alert("复制失败", "请手动复制地址");
      }
    }
  };

  const handleShare = async () => {
    if (!qrWrapperRef.current) return;
    try {
      const uri = await captureRef(qrWrapperRef, {
        format: "png",
        quality: 1,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          dialogTitle: "分享收款二维码",
        });
      } else {
        const { Share } = require("react-native");
        await Share.share({ message: `${currentToken.symbol} (${network}) 收款地址: ${address}` });
      }
    } catch (err: any) {
      alert("分享失败", err.message || "请尝试复制地址后手动分享");
    }
  };

  return (
    <View style={styles.container}>
      {/* 代币 icon + 名称 + network */}
      <View style={styles.tokenHeader}>
        {renderNetworkIcon(network, 36) && (
          <View style={styles.tokenIconWrap}>
            {renderNetworkIcon(network, 36)}
          </View>
        )}
        <View style={styles.tokenNameRow}>
          <Text style={styles.tokenName}>{currentToken.symbol}</Text>
          {renderNetworkIcon(network, 0) && (
            <View style={styles.networkBadge}>
              <Text style={styles.networkBadgeText}>{network}</Text>
            </View>
          )}
        </View>
      </View>

      {/* QR Code */}
      <View style={styles.qrContainer}>
        {address ? (
          <View ref={qrWrapperRef} style={styles.qrWrapper} collapsable={false}>
            <QRCode
              value={qrValue || address}
              size={220}
              color="#1F2937"
              backgroundColor="#FFFFFF"
            />
            <Text style={styles.qrAddressLabel}>{network} 收款地址</Text>
            <Text style={styles.qrAddress} selectable adjustsFontSizeToFit numberOfLines={1}>
              {address}
            </Text>
          </View>
        ) : (
          <View style={styles.qrPlaceholder}>
            <Text style={styles.qrText}>—</Text>
            <Text style={styles.qrHint}>请先选择钱包</Text>
          </View>
        )}
      </View>

      {/* Quick action buttons */}
      {address ? (
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <ShareIcon size={22} color="#374151" />
            <Text style={styles.actionLabel}>分享二维码</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
            <CopyIcon size={22} color="#374151" />
            <Text style={styles.actionLabel}>复制地址</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Warning tip */}
      <View style={styles.warningBox}>
        <Text style={styles.warningIcon}>💡</Text>
        <Text style={styles.warningText}>
          仅支持当前网络地址，请确认对方网络一致，否则资产可能丢失
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", padding: 24, backgroundColor: "#F9FAFB" },
  tokenHeader: {
    alignItems: "center",
    marginTop: 24,
    marginBottom: 20,
  },
  tokenIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  tokenNameRow: {
    alignItems: "center",
    gap: 8,
  },
  tokenName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
  },
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
  qrContainer: { alignItems: "center" },
  qrWrapper: {
    alignItems: "center",
    padding: 28,
    backgroundColor: "#fff",
    borderRadius: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  qrAddressLabel: { fontSize: 12, color: "#6B7280", marginTop: 16, marginBottom: 4 },
  qrAddress: {
    fontSize: 12,
    color: "#374151",
    fontFamily: "monospace",
    textAlign: "center",
    maxWidth: 280,
  },
  qrPlaceholder: {
    width: 276,
    height: 276,
    backgroundColor: "#fff",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  qrText: { fontSize: 36, fontWeight: "300", color: "#D1D5DB" },
  qrHint: { fontSize: 13, color: "#9CA3AF", marginTop: 8 },
  quickActions: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    width: "100%",
  },
  actionBtn: { flex: 1, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 13, color: "#374151", fontWeight: "500", marginTop: 4 },
  warningBox: {
    flexDirection: "row",
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    alignItems: "flex-start",
    width: "100%",
  },
  warningIcon: { fontSize: 18, marginRight: 10, marginTop: 1 },
  warningText: { flex: 1, fontSize: 13, color: "#92400E", lineHeight: 20 },
});
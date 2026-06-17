import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, Pressable } from "react-native";
import type { TokenBalance } from "../types";
import TronIcon from "./icons/TronIcon";
import { USDTIcon } from "./icons";

// New SVG icons as React components per 1.0.2 requirements
const TransferIconNew = ({ size = 24, color = "#E2E0F0" }: { size?: number; color?: string }) => (
  <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
    <Text style={{ fontSize: size * 0.7, color }}>⇄</Text>
  </View>
);

const ReceiveIconNew = ({ size = 24, color = "#E2E0F0" }: { size?: number; color?: string }) => (
  <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
    <Text style={{ fontSize: size * 0.7, color }}>↓</Text>
  </View>
);

const TradeIconNew = ({ size = 24, color = "#E2E0F0" }: { size?: number; color?: string }) => (
  <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}>
    <Text style={{ fontSize: size * 0.7, color }}>⇋</Text>
  </View>
);

function renderTokenIcon(symbol: string, size: number) {
  if (symbol === "TRX") return <TronIcon size={size} />;
  return <USDTIcon size={size} />;
}

interface Props {
  onTransfer: () => void;
  onReceive: (token: TokenBalance) => void;
  onRecords: () => void;
  tokens: TokenBalance[];
}

export default function ActionButtons({
  onTransfer,
  onReceive,
  onRecords,
  tokens,
}: Props) {
  const [showTokenPicker, setShowTokenPicker] = useState(false);

  return (
    <>
      <View style={styles.container}>
        <TouchableOpacity style={styles.button} onPress={onTransfer}>
          <View style={styles.iconCircle}>
            <TransferIconNew size={24} color="#E2E0F0" />
          </View>
          <Text style={styles.label}>转账</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() => setShowTokenPicker(true)}
        >
          <View style={styles.iconCircle}>
            <ReceiveIconNew size={24} color="#E2E0F0" />
          </View>
          <Text style={styles.label}>收款</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={onRecords}>
          <View style={styles.iconCircle}>
            <TradeIconNew size={24} color="#E2E0F0" />
          </View>
          <Text style={styles.label}>交易</Text>
        </TouchableOpacity>
      </View>

      {/* Token picker modal */}
      <Modal visible={showTokenPicker} transparent animationType="fade">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowTokenPicker(false)}
        >
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>选择收款代币</Text>
            <FlatList
              data={tokens}
              keyExtractor={(item) => item.tokenId || item.symbol}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setShowTokenPicker(false);
                    onReceive(item);
                  }}
                >
                  <View style={styles.pickerItemIcon}>
                    {renderTokenIcon(item.symbol, 24)}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemName}>
                      {item.symbol} - {item.name}
                    </Text>
                    <Text style={styles.pickerItemBalance}>
                      余额: {item.balance}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 300 }}
            />
            <TouchableOpacity
              style={styles.pickerCancelBtn}
              onPress={() => setShowTokenPicker(false)}
            >
              <Text style={styles.pickerCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginHorizontal: 16,
    backgroundColor: "rgba(34, 32, 56, 0.1)",
    borderRadius: 12,
    padding: 16,
  },
  button: { flex: 1, alignItems: "center" },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(34, 32, 56, 0.1)", // #222038 with 10% opacity
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    color: "#E2E0F0",
    fontWeight: "500",
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  pickerCard: {
    backgroundColor: "#1A1A2E",
    borderRadius: 16,
    padding: 20,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 16,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#222038",
  },
  pickerItemIcon: {
    width: 32,
    height: 32,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerItemName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  pickerItemBalance: {
    fontSize: 12,
    color: "#E2E0F0",
    marginTop: 2,
    opacity: 0.7,
  },
  pickerCancelBtn: {
    padding: 14,
    marginTop: 12,
    backgroundColor: "rgba(34, 32, 56, 0.3)",
    borderRadius: 10,
    alignItems: "center",
  },
  pickerCancelText: { color: "#E2E0F0", fontWeight: "600" },
});

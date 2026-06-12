import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, Pressable } from "react-native";
import { TransferIcon, ReceiveIcon, RecordsIcon, USDTIcon } from "./icons";
import TronIcon from "./icons/TronIcon";
import type { TokenBalance } from "../types";

interface Props {
  onTransfer: () => void;
  onReceive: (token: TokenBalance) => void;
  onRecords: () => void;
  tokens: TokenBalance[];
}

function renderTokenIcon(symbol: string, size: number) {
  if (symbol === "TRX") return <TronIcon size={size} />;
  return <USDTIcon size={size} />;
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
          <TransferIcon size={28} color="#3B82F6" />
          <Text style={styles.label}>转账</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => setShowTokenPicker(true)}>
          <ReceiveIcon size={28} color="#10B981" />
          <Text style={styles.label}>收款</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={onRecords}>
          <RecordsIcon size={28} color="#F59E0B" />
          <Text style={styles.label}>记录</Text>
        </TouchableOpacity>
      </View>

      {/* 代币选择弹窗 */}
      <Modal visible={showTokenPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowTokenPicker(false)}>
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
                    <Text style={styles.pickerItemName}>{item.symbol} - {item.name}</Text>
                    <Text style={styles.pickerItemBalance}>余额: {item.balance}</Text>
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
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  button: { flex: 1, alignItems: "center" },
  label: { fontSize: 14, color: "#374151", fontWeight: "500", marginTop: 8 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  pickerCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 16,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  pickerItemIcon: {
    width: 32,
    height: 32,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerItemName: { fontSize: 15, fontWeight: "500", color: "#1F2937" },
  pickerItemBalance: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  pickerCancelBtn: {
    padding: 14,
    marginTop: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    alignItems: "center",
  },
  pickerCancelText: { color: "#6B7280", fontWeight: "600" },
});

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from "react-native";
import { useFiatStore } from "../stores/fiatStore";

export default function SettingsScreen() {
  const { currency, availableCurrencies, setCurrency, fetchAvailableCurrencies, loadCurrency } =
    useFiatStore();
  const [showFiatPicker, setShowFiatPicker] = useState(false);

  useEffect(() => {
    loadCurrency();
    fetchAvailableCurrencies();
  }, []);

  return (
    <View style={styles.container}>
      {/* 法币单位 */}
      <TouchableOpacity style={styles.menuItem} onPress={() => setShowFiatPicker(true)}>
        <Text style={styles.menuLabel}>法币单位</Text>
        <View style={styles.menuRight}>
          <Text style={styles.menuValue}>
            {currency.symbol} {currency.name}
          </Text>
          <Text style={styles.menuArrow}>›</Text>
        </View>
      </TouchableOpacity>

      {/* 法币选择弹窗 */}
      <Modal visible={showFiatPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>选择法币单位</Text>
            <FlatList
              data={availableCurrencies}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.fiatItem,
                    item.code === currency.code && styles.fiatItemActive,
                  ]}
                  onPress={async () => {
                    await setCurrency(item.code);
                    setShowFiatPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.fiatItemText,
                      item.code === currency.code && styles.fiatItemTextActive,
                    ]}
                  >
                    {item.symbol}  {item.name}（{item.code}）
                  </Text>
                  {item.code === currency.code && (
                    <Text style={styles.fiatCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowFiatPicker(false)}
            >
              <Text style={styles.modalCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  menuLabel: { fontSize: 16, color: "#1F2937" },
  menuRight: { flexDirection: "row", alignItems: "center" },
  menuValue: { fontSize: 15, color: "#6B7280", marginRight: 8 },
  menuArrow: { fontSize: 20, color: "#D1D5DB", fontWeight: "300" },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 16,
  },
  fiatItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 10,
    marginBottom: 4,
  },
  fiatItemActive: { backgroundColor: "#EFF6FF" },
  fiatItemText: { fontSize: 16, color: "#374151" },
  fiatItemTextActive: { color: "#3B82F6", fontWeight: "600" },
  fiatCheck: { color: "#3B82F6", fontWeight: "700", fontSize: 16 },
  modalCancelBtn: {
    padding: 14,
    marginTop: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    alignItems: "center",
  },
  modalCancelText: { color: "#6B7280", fontWeight: "600", fontSize: 15 },
});

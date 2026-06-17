import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useFiatStore } from "../stores/fiatStore";

export default function SettingsScreen() {
  const { currency, loadCurrency } = useFiatStore();

  useEffect(() => {
    loadCurrency();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.menuItem}>
        <Text style={styles.menuLabel}>法币单位</Text>
        <Text style={styles.menuValue}>
          {currency.symbol} {currency.name}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", paddingTop: 8 },
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
  menuLabel: { fontSize: 16, fontWeight: "500", color: "#1F2937" },
  menuValue: { fontSize: 14, color: "#6B7280" },
});

import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useFiatStore } from "../stores/fiatStore";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { currency, loadCurrency } = useFiatStore();

  useEffect(() => {
    loadCurrency();
  }, []);

  return (
    <View style={styles.container}>
      {/* 法币单位（固定 USD，仅展示） */}
      <View style={styles.menuItem}>
        <Text style={styles.menuLabel}>法币单位</Text>
        <View style={styles.menuRight}>
          <Text style={styles.menuValue}>
            {currency.symbol} {currency.name}
          </Text>
        </View>
      </View>

      {/* 其他菜单项 */}
      <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate("Security")}>
        <Text style={styles.menuLabel}>安全设置</Text>
        <Text style={styles.menuArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate("About")}>
        <Text style={styles.menuLabel}>关于</Text>
        <Text style={styles.menuArrow}>›</Text>
      </TouchableOpacity>
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
  menuRight: { flexDirection: "row", alignItems: "center" },
  menuValue: { fontSize: 14, color: "#6B7280" },
  menuArrow: { fontSize: 20, color: "#D1D5DB", fontWeight: "300" },
});

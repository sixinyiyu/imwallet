import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.placeholder}>通用设置页面</Text>
      <Text style={styles.hint}>语言 / 法币单位 / 主题模式 设置</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  placeholder: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
    textAlign: "center",
    marginTop: 40,
  },
  hint: { fontSize: 14, color: "#9CA3AF", textAlign: "center", marginTop: 8 },
});

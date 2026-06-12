import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";

export default function AboutScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.logo}>imwallet</Text>
        <Text style={styles.version}>版本 0.1.0</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.item}>开源协议: MIT</Text>
        <Text style={styles.item}>官方网站: imwallet.io</Text>
        <Text style={styles.item}>用户协议</Text>
        <Text style={styles.item}>隐私政策</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    alignItems: "center",
  },
  logo: { fontSize: 28, fontWeight: "700", color: "#1F2937" },
  version: { fontSize: 14, color: "#6B7280", marginTop: 8 },
  item: {
    fontSize: 15,
    color: "#374151",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
});

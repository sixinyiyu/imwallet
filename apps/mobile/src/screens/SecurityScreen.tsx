import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";

export default function SecurityScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.placeholder}>安全与隐私</Text>
      <Text style={styles.hint}>修改密码 / 生物识别 / 隐私模式 / 清除缓存 / 备份助记词</Text>
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

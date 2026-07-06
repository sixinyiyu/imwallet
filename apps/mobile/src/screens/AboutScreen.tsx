import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from "react-native";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const appLogoImage = require("../../assets/app_logo.png");

export default function AboutScreen() {
  const navigation = useNavigation<Nav>();
  const appVersion = Constants.expoConfig?.version || "unknown";

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Image source={appLogoImage} style={styles.logoImage} resizeMode="contain" />
        <Text style={styles.appName}>AquaD</Text>
        <Text style={styles.version}>版本 {appVersion}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.item}>开源协议: MIT</Text>
        <Text style={styles.item}>官方网站: aquad.io</Text>
        <Text style={styles.item}>用户协议</Text>
        <Text style={styles.item}>隐私政策</Text>
      </View>
      {/* 反馈建议入口 */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.feedbackRow}
          onPress={() => navigation.navigate("Feedback")}
          activeOpacity={0.7}
        >
          <Text style={styles.feedbackLabel}>反馈与建议</Text>
          <Text style={styles.feedbackArrow}>›</Text>
        </TouchableOpacity>
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
  logoImage: { width: 80, height: 80, marginBottom: 8 },
  appName: { fontSize: 28, fontWeight: "700", color: "#1F2937" },
  version: { fontSize: 14, color: "#6B7280", marginTop: 8 },
  item: {
    fontSize: 15,
    color: "#374151",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  feedbackLabel: {
    fontSize: 15,
    color: "#374151",
  },
  feedbackArrow: {
    fontSize: 20,
    color: "#D1D5DB",
    fontWeight: "300",
  },
});
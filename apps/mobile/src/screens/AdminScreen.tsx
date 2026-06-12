import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import UserManageIcon from "../components/icons/UserManageIcon";

type Nav = NativeStackNavigationProp<RootStackParamList, "Admin">;

export default function AdminScreen() {
  const navigation = useNavigation<Nav>();

  const menuItems = [
    {
      label: "用户管理",
      icon: <UserManageIcon size={26} color="#3B82F6" />,
      screen: "UserManage" as keyof RootStackParamList,
      desc: "查看所有用户、审核激活、删除用户",
    },
  ];

  return (
    <ScrollView style={styles.container}>
      {menuItems.map((item, index) => (
        <TouchableOpacity
          key={index}
          style={styles.menuItem}
          onPress={() => navigation.navigate(item.screen)}
        >
          <View style={styles.menuItemLeft}>
            <View style={styles.menuIconBox}>{item.icon}</View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuDesc}>{item.desc}</Text>
            </View>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
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
  menuItemLeft: { flexDirection: "row", alignItems: "center" },
  menuIconBox: { width: 36, alignItems: "center", marginRight: 12 },
  menuTextContainer: { flex: 1 },
  menuLabel: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  menuDesc: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  menuArrow: { fontSize: 20, color: "#D1D5DB", fontWeight: "300" },
});
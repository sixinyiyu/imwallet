import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";
import { notificationService } from "../services/authService";
import { WalletIcon, AboutIcon, CopyIcon } from "../components/icons";
import BellIcon from "../components/icons/BellIcon";

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  screen?: keyof RootStackParamList;
  badge?: string;
}

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { wallets } = useWalletStore();
  const totalAccountCount = wallets.reduce((sum, w) => sum + w.accountCount, 0);
  const [unreadCount, setUnreadCount] = React.useState(0);

  const fetchUnreadCount = async () => {
    try {
      const notifications = await notificationService.getNotifications();
      const count = notifications.filter((n: any) => !n.isRead).length;
      setUnreadCount(count);
    } catch {
      // silent
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }, [])
  );

  const menuItems: MenuItem[] = [
    { icon: <WalletIcon size={22} color="#3B82F6" />, label: "钱包管理", screen: "WalletManage", badge: `${totalAccountCount} 个钱包` },
    { icon: <CopyIcon size={22} color="#10B981" />, label: "地址本", screen: "AddressBook" },
    { icon: <Text style={styles.emojiIcon}>⚙️</Text>, label: "通用设置", screen: "Settings" },
    { icon: <Text style={styles.emojiIcon}>🔐</Text>, label: "安全与隐私", screen: "Security" },
    { icon: <AboutIcon size={22} color="#8B5CF6" />, label: "关于我们", screen: "About" },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>我</Text>
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => navigation.navigate("Notifications")}
        >
          <BellIcon size={22} color="#374151" />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.menuItem}
            onPress={() => {
              if (item.screen) {
                navigation.navigate(item.screen as any);
              }
            }}
          >
            <View style={styles.menuItemLeft}>
              <View style={styles.menuIconBox}>{item.icon}</View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                {item.badge && <Text style={styles.menuBadge}>{item.badge}</Text>}
              </View>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  bellButton: {
    position: "absolute",
    right: 16,
    top: 56,
    bottom: 12,
    justifyContent: "center",
    alignItems: "center",
    padding: 4,
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  content: { flex: 1, paddingTop: 8 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  menuItemLeft: { flexDirection: "row", alignItems: "center" },
  menuIconBox: { width: 32, alignItems: "center", marginRight: 12 },
  emojiIcon: { fontSize: 20 },
  menuLabel: { fontSize: 16, color: "#1F2937" },
  menuTextWrap: { flex: 1 },
  menuBadge: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  menuArrow: { fontSize: 20, color: "#D1D5DB", fontWeight: "300" },
});

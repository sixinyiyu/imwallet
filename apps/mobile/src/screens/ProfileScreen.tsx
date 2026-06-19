import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import { useAuthStore } from "../stores/authStore";
import { useWalletStore } from "../stores/walletStore";
import { notificationService } from "../services/authService";
import { WalletIcon, AboutIcon, LogoutIcon, CopyIcon } from "../components/icons";
import BellIcon from "../components/icons/BellIcon";

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  screen?: keyof RootStackParamList;
  action?: () => void;
  badge?: string;
}

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { deviceId, logout } = useAuthStore();
  const { wallets, logout: walletStoreLogout } = useWalletStore();
  const totalAccountCount = wallets.reduce((sum, w) => sum + w.accountCount, 0);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [showLogoutModal, setShowLogoutModal] = React.useState(false);

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

  const handleLogout = async () => {
    setShowLogoutModal(false);
    try {
      await walletStoreLogout();
      await logout();
      // 登出后跳转到 Start 导航页
      navigation.replace("Start" as any);
    } catch {
      // ignore
    }
  };

  const menuItems: MenuItem[] = [
    { icon: <WalletIcon size={22} color="#3B82F6" />, label: "钱包管理", screen: "WalletManage", badge: `${totalAccountCount} 个钱包` },
    { icon: <CopyIcon size={22} color="#10B981" />, label: "地址本", screen: "AddressBook" },
    { icon: <Text style={styles.emojiIcon}>⚙️</Text>, label: "通用设置", screen: "Settings" },
    { icon: <Text style={styles.emojiIcon}>🔐</Text>, label: "安全与隐私", screen: "Security" },
    { icon: <AboutIcon size={22} color="#8B5CF6" />, label: "关于我们", screen: "About" },
    {
      icon: <LogoutIcon size={22} color="#EF4444" />,
      label: "退出",
      action: () => setShowLogoutModal(true),
    },
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
              } else if (item.action) {
                item.action();
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

      {/* 退出确认弹窗 */}
      <Modal visible={showLogoutModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>退出登录</Text>
            <Text style={styles.modalMessage}>确定要退出登录吗？</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleLogout}
              >
                <Text style={styles.modalConfirmText}>确定退出</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  modalCancelText: { color: "#6B7280", fontWeight: "600", fontSize: 15 },
  modalConfirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    alignItems: "center",
  },
  modalConfirmText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
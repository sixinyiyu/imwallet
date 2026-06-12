import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from "react-native";
import { notificationService } from "../services/authService";
import type { Notification } from "../types";

export default function NotificationScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = async (p: number = 1) => {
    try {
      const result = await notificationService.getNotifications(p, 20);
      if (p === 1) {
        setNotifications(result.notifications);
      } else {
        setNotifications(prev => [...prev, ...result.notifications]);
      }
      setTotal(result.total);
      setPage(p);
    } catch (err: any) {
      // silent
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications(1);
    setRefreshing(false);
  };

  const handleMarkRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
    } catch {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {
      // silent
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "TRANSFER_IN": return "📥";
      case "TRANSFER_OUT": return "📤";
      case "ACCOUNT_ACTIVATED": return "✅";
      case "ACCOUNT_REJECTED": return "❌";
      default: return "🔔";
    }
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.item, !item.isRead && styles.itemUnread]}
      onPress={() => {
        if (!item.isRead) {
          handleMarkRead(item.id);
        }
      }}
    >
      <View style={styles.itemLeft}>
        <Text style={styles.typeIcon}>{getTypeIcon(item.type)}</Text>
        {!item.isRead && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.itemContent}>
        <Text style={[styles.title, !item.isRead && styles.titleUnread]}>
          {item.title}
        </Text>
        <Text style={styles.contentText} numberOfLines={2}>
          {item.content}
        </Text>
        <Text style={styles.dateText}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllRead}>
          <Text style={styles.markAllText}>全部标记已读 ({unreadCount}条未读)</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>暂无通知</Text>
          </View>
        }
        contentContainerStyle={notifications.length === 0 ? styles.emptyList : undefined}
        onEndReached={() => {
          if (notifications.length < total) {
            fetchNotifications(page + 1);
          }
        }}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  markAllBtn: {
    backgroundColor: "#EFF6FF",
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#DBEAFE",
  },
  markAllText: { color: "#3B82F6", fontSize: 14, fontWeight: "500" },
  item: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
  },
  itemUnread: {
    backgroundColor: "#F0F7FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  itemLeft: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  typeIcon: { fontSize: 24 },
  unreadDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  itemContent: { flex: 1, marginLeft: 8 },
  title: { fontSize: 15, fontWeight: "500", color: "#374151" },
  titleUnread: { fontWeight: "700", color: "#1F2937" },
  contentText: { fontSize: 13, color: "#6B7280", marginTop: 4, lineHeight: 18 },
  dateText: { fontSize: 12, color: "#9CA3AF", marginTop: 6 },
  empty: { alignItems: "center", padding: 32 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
  emptyList: { flexGrow: 1, justifyContent: "center" },
});
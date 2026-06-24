import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { localNotificationService } from "../services/localNotificationService";
import { notificationSyncService } from "../services/notificationSyncService";
import { useAlert } from "../hooks/useAlert";
import { detectNetwork } from "../utils/address";
import { TronIcon, EthIcon, BtcIcon, ContactIcon } from "../components/icons";
import { NotificationSkeleton } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import type { Notification } from "../types";

function NetworkIcon({ network, size = 20 }: { network: string; size?: number }) {
  if (!network) return <ContactIcon size={size} color="#6B7280" />;
  switch (network) {
    case "Tron": return <TronIcon size={size} />;
    case "Ethereum":  return <EthIcon size={size} />;
    case "Bitcoin":  return <BtcIcon size={size} />;
    default:     return <ContactIcon size={size} color="#6B7280" />;
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case "TRANSFER_IN": return "📥";
    case "TRANSFER_OUT": return "📤";
    case "ACCOUNT_ACTIVATED": return "✅";
    case "ACCOUNT_REJECTED": return "❌";
    default: return "🔔";
  }
}

export default function NotificationScreen() {
  const alert = useAlert();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLocal = async () => {
    try {
      const data = await localNotificationService.getAllNotifications();
      setNotifications(data);
    } catch {
      // silent
    }
  };

  const onRefresh = async () => {
    setLoading(true);
    try {
      await notificationSyncService.syncNotifications();
      await loadLocal();
    } catch {
      // silent
    }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      await onRefresh();
    })();
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await localNotificationService.markAsRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
    } catch {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await localNotificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {
      // silent
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

  if (loading && notifications.length === 0) {
    return <NotificationSkeleton count={4} />;
  }

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
          <RefreshControl refreshing={loading} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <EmptyState message="暂无通知" />
        }
        contentContainerStyle={notifications.length === 0 ? styles.emptyList : undefined}
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
  emptyList: { flexGrow: 1, justifyContent: "center" },
});

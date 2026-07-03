import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Animated,
  PanResponder,
} from "react-native";
import { localNotificationService } from "../services/localNotificationService";
import { notificationSyncService } from "../services/notificationSyncService";
import { useAlert } from "../hooks/useAlert";
import { useWalletStore } from "../stores/walletStore";
import { renderTokenIcon } from "../components/icons";
import { NotificationSkeleton } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import type { Notification } from "../types";
import { formatTime } from "../utils/date";
import { saveLogToLocal } from "../services/logService";
import { getErrorMessage } from "../utils/format";

function getTypeIcon(type: string) {
  switch (type) {
    case "TRANSFER_IN": return "📥";
    case "TRANSFER_OUT": return "📤";
    case "ACCOUNT_ACTIVATED": return "✅";
    case "ACCOUNT_REJECTED": return "❌";
    default: return "🔔";
  }
}

const DELETE_BTN_WIDTH = 80;

/** 左划删除行组件 */
function SwipeableRow({
  item,
  walletAlias,
  isCurrentlyOpen,
  onRowOpen,
  onRowClose,
  onMarkRead,
  onPress,
  onDelete,
}: {
  item: Notification;
  walletAlias: string;
  isCurrentlyOpen: boolean;
  onRowOpen: (id: string) => void;
  onRowClose: () => void;
  onMarkRead: (id: string) => void;
  onPress: (item: Notification) => void;
  onDelete: (id: string) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipedOpen = useRef(false);

  // 删除按钮 opacity：随滑动距离从 0→1 渐变，未划开时完全不可见
  const deleteOpacity = translateX.interpolate({
    inputRange: [-DELETE_BTN_WIDTH, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  // 当其他行被划开或点击空白区域时，收回当前行
  useEffect(() => {
    if (!isCurrentlyOpen && isSwipedOpen.current) {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      isSwipedOpen.current = false;
    }
  }, [isCurrentlyOpen, translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 30,
      onPanResponderMove: (_, gestureState) => {
        const newVal = Math.min(gestureState.dx, 0);
        translateX.setValue(newVal + (isSwipedOpen.current ? -DELETE_BTN_WIDTH : 0));
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isSwipedOpen.current) {
          if (gestureState.dx > 40) {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
            isSwipedOpen.current = false;
            onRowClose();
          } else {
            Animated.spring(translateX, { toValue: -DELETE_BTN_WIDTH, useNativeDriver: true }).start();
          }
        } else {
          if (gestureState.dx < -40) {
            Animated.spring(translateX, { toValue: -DELETE_BTN_WIDTH, useNativeDriver: true }).start();
            isSwipedOpen.current = true;
            onRowOpen(item.id);
          } else {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          }
        }
      },
    })
  ).current;

  const meta = item.metadata;
  const tokenSymbol = meta?.tokenSymbol;
  const chain = meta?.chain;
  const amount = meta?.amount;

  const displayTitle = `${walletAlias} · ${item.title}`;
  const displayContent = amount
    ? `${tokenSymbol || ""}${amount} ${chain ? `(${chain})` : ""}`
    : item.content;

  const handleDelete = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    isSwipedOpen.current = false;
    onRowClose();
    onDelete(item.id);
  };

  return (
    <View style={styles.swipeContainer}>
      {/* 删除按钮（opacity 随滑动渐变，未划开时完全透明） */}
      <Animated.View style={[styles.deleteBtnContainer, { opacity: deleteOpacity }]}>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>删除</Text>
        </TouchableOpacity>
      </Animated.View>
      {/* 通知内容（可滑动） */}
      <Animated.View
        style={[styles.itemAnimated, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={[styles.item, !item.isRead && styles.itemUnread]}
          onPress={() => {
            // 点击时先关闭划开状态
            if (isSwipedOpen.current) {
              Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
              isSwipedOpen.current = false;
              onRowClose();
              return;
            }
            onPress(item);
          }}
          activeOpacity={0.7}
        >
          <View style={styles.itemLeft}>
            {tokenSymbol
              ? <View style={styles.tokenIconWrap}>{renderTokenIcon(tokenSymbol, 22, "🪙")}</View>
              : <Text style={styles.typeIcon}>{getTypeIcon(item.type)}</Text>
            }
            {!item.isRead && <View style={styles.unreadDot} />}
          </View>
          <View style={styles.itemContent}>
            <Text style={[styles.title, !item.isRead && styles.titleUnread]}>
              {displayTitle}
            </Text>
            <Text style={styles.contentText} numberOfLines={2}>
              {displayContent}
            </Text>
            <Text style={styles.dateText}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function NotificationScreen() {
  const alert = useAlert();
  const wallets = useWalletStore((s) => s.wallets);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  // Toast 状态
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const loadLocal = async () => {
    try {
      const data = await localNotificationService.getAllNotifications();
      setNotifications(data);
    } catch (err: unknown) {
      saveLogToLocal("info", `[NotificationScreen] loadLocal failed: ${getErrorMessage(err, "加载失败")}`);
    }
  };

  const onRefresh = async () => {
    setLoading(true);
    try {
      await notificationSyncService.syncNotifications();
      await loadLocal();
    } catch (err: unknown) {
      saveLogToLocal("info", `[NotificationScreen] onRefresh failed: ${getErrorMessage(err, "刷新失败")}`);
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
    } catch (err: unknown) {
      showToast("标记已读失败: " + getErrorMessage(err, "请稍后重试"));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await localNotificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err: unknown) {
      showToast("全部标记已读失败: " + getErrorMessage(err, "请稍后重试"));
    }
  };

  /** 根据 walletId 查本地钱包别名 */
  const getWalletAlias = (walletId: string): string => {
    const w = wallets.find((w) => w.id === walletId);
    return w?.name || walletId;
  };

  /** 点击通知：关闭其他划开行 + 标记已读 */
  const handleNotificationPress = (item: Notification) => {
    setOpenRowId(null); // 点击其他行时收回划开的行
    if (!item.isRead) {
      handleMarkRead(item.id);
    }
  };

  /** 删除通知：本地物理删除 + 记录 deleted ID */
  const handleDeleteNotification = async (id: string) => {
    setOpenRowId(null);
    try {
      await localNotificationService.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err: unknown) {
      showToast("删除失败: " + getErrorMessage(err, "请稍后重试"));
    }
  };

  /** 某行被划开 → 设置 openRowId（其他行自动收回） */
  const handleRowOpen = (id: string) => {
    setOpenRowId(id);
  };

  /** 某行被收回 → 清空 openRowId */
  const handleRowClose = () => {
    setOpenRowId(null);
  };

  /** 点击空白区域 → 收回划开的行 */
  const handleContainerTouch = () => {
    if (openRowId) {
      setOpenRowId(null);
    }
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <SwipeableRow
      item={item}
      walletAlias={getWalletAlias(item.walletId)}
      isCurrentlyOpen={openRowId === item.id}
      onRowOpen={handleRowOpen}
      onRowClose={handleRowClose}
      onMarkRead={handleMarkRead}
      onPress={handleNotificationPress}
      onDelete={handleDeleteNotification}
    />
  );

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (loading && notifications.length === 0) {
    return <NotificationSkeleton count={4} />;
  }

  return (
    <View style={styles.container} onTouchStart={handleContainerTouch}>
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

      {/* Toast */}
      {toastVisible && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        </View>
      )}
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
  // ── 左划删除容器 ──
  swipeContainer: {
    overflow: "hidden",
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
  },
  deleteBtnContainer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BTN_WIDTH,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteBtn: {
    backgroundColor: "#EF4444",
    width: DELETE_BTN_WIDTH,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  // ── 通知行 ──
  itemAnimated: {},
  item: {
    backgroundColor: "#fff",
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
  tokenIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
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
  // ── Toast ──
  toastWrap: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toast: { backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  toastText: { color: "#FFFFFF", fontSize: 14 },
});
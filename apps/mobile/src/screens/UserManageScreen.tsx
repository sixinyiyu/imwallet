import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { adminService } from "../services/authService";

interface DeviceItem {
  id: number;
  device_id: string;
  platform: string;
  os: string | null;
  model: string | null;
  locale: string | null;
  created_at: string;
}

export default function UserManageScreen() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDevices = async () => {
    try {
      const result = await adminService.getAllDevices();
      setDevices(result);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDevices();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: DeviceItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.deviceId}>{item.device_id.slice(0, 16)}...</Text>
        <Text style={styles.platformBadge}>{item.platform}</Text>
      </View>
      <Text style={styles.cardInfo}>
        {item.os || "-"} · {item.model || "-"} · {item.locale || "-"}
      </Text>
      <Text style={styles.cardDate}>
        {new Date(item.created_at).toLocaleDateString()}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>设备管理</Text>
      <FlatList
        data={devices}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>暂无设备</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC", padding: 16 },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 16 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  deviceId: { fontSize: 14, fontWeight: "600", color: "#1E293B" },
  platformBadge: { fontSize: 12, color: "#3B82F6", fontWeight: "500" },
  cardInfo: { fontSize: 12, color: "#64748B", marginTop: 4 },
  cardDate: { fontSize: 11, color: "#94A3B8", marginTop: 4 },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40 },
});

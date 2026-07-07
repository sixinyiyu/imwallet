import { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";

/** Single animated skeleton bar */
export function SkeletonBar({
  width,
  height = 14,
  borderRadius = 6,
  style,
}: {
  width: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: "#E5E7EB",
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Skeleton circle (avatar / icon placeholder) */
export function SkeletonCircle({ size = 36, style }: { size?: number; style?: any }) {
  return (
    <SkeletonBar
      width={size}
      height={size}
      borderRadius={size / 2}
      style={style}
    />
  );
}

// ─── Page-specific skeleton layouts ───

/** Wallet list skeleton */
export function WalletListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={s.page}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={s.walletCard}>
          <View style={s.walletRow}>
            <SkeletonCircle size={40} />
            <View style={s.walletInfo}>
              <SkeletonBar width="40%" height={16} />
              <SkeletonBar width="70%" height={12} style={{ marginTop: 8 }} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Wallet detail skeleton */
export function WalletDetailSkeleton() {
  return (
    <View style={s.page}>
      <View style={s.detailCard}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={i} style={s.detailRow}>
            <SkeletonBar width="30%" height={14} />
            <SkeletonBar width="50%" height={14} />
          </View>
        ))}
      </View>
      <View style={{ marginTop: 24 }}>
        <SkeletonBar width="50%" height={16} style={{ marginBottom: 12 }} />
        {Array.from({ length: 2 }).map((_, i) => (
          <View key={i} style={s.accountCard}>
            <SkeletonCircle size={36} />
            <View style={s.accountInfo}>
              <SkeletonBar width="30%" height={14} />
              <SkeletonBar width="60%" height={12} style={{ marginTop: 6 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Address book skeleton */
export function AddressBookSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={s.page}>
      <SkeletonBar width="100%" height={48} borderRadius={10} style={{ marginBottom: 16 }} />
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={s.contactCard}>
          <SkeletonCircle size={36} />
          <View style={s.contactInfo}>
            <SkeletonBar width="35%" height={14} />
            <SkeletonBar width="70%" height={12} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Transaction list skeleton */
export function TransactionListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={s.page}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={s.txCard}>
          <View style={s.txTopRow}>
            <View style={s.txLabelWrap}>
              <SkeletonCircle size={28} />
              <SkeletonBar width={40} height={14} style={{ marginLeft: 8 }} />
            </View>
            <SkeletonBar width="25%" height={16} />
          </View>
          <View style={s.txMiddleRow}>
            <SkeletonBar width="50%" height={12} />
          </View>
          <View style={s.txBottomRow}>
            <SkeletonBar width="30%" height={12} />
            <SkeletonBar width="20%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Trade detail skeleton */
export function TradeDetailSkeleton() {
  return (
    <View style={s.page}>
      <View style={{ alignItems: "center", paddingVertical: 24 }}>
        <SkeletonCircle size={72} />
        <SkeletonBar width={80} height={20} style={{ marginTop: 12 }} />
        <SkeletonBar width="60%" height={14} style={{ marginTop: 8 }} />
      </View>
      <SkeletonBar width="30%" height={16} style={{ marginBottom: 8 }} />
      <View style={s.detailCard}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={s.detailRow}>
            <SkeletonBar width="25%" height={14} />
            <SkeletonBar width="45%" height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Receive screen skeleton */
export function ReceiveSkeleton() {
  return (
    <View style={[s.page, { alignItems: "center" }]}>
      <View style={{ alignItems: "center", marginTop: 24, marginBottom: 20 }}>
        <SkeletonCircle size={56} />
        <SkeletonBar width={60} height={20} style={{ marginTop: 10 }} />
      </View>
      <View style={{ alignItems: "center", padding: 28, backgroundColor: "#fff", borderRadius: 16 }}>
        <SkeletonBar width={220} height={220} borderRadius={8} />
        <SkeletonBar width="50%" height={12} style={{ marginTop: 16 }} />
        <SkeletonBar width="70%" height={12} style={{ marginTop: 4 }} />
      </View>
      <View style={{ flexDirection: "row", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginTop: 20, width: "100%" }}>
        <View style={{ flex: 1, alignItems: "center" }}>
          <SkeletonCircle size={22} />
          <SkeletonBar width={60} height={12} style={{ marginTop: 4 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center" }}>
          <SkeletonCircle size={22} />
          <SkeletonBar width={60} height={12} style={{ marginTop: 4 }} />
        </View>
      </View>
    </View>
  );
}

/** Notification list skeleton */
export function NotificationSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={s.page}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={s.notifCard}>
          <SkeletonCircle size={40} />
          <View style={s.notifInfo}>
            <SkeletonBar width="40%" height={14} />
            <SkeletonBar width="80%" height={12} style={{ marginTop: 6 }} />
            <SkeletonBar width="25%" height={12} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Recharge record cards skeleton (for filter switching loading state) */
export function RechargeRecordSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={s.rechargeRecordCard}>
          <View style={s.rechargeRecordTop}>
            <View style={s.rechargeRecordLeft}>
              <SkeletonCircle size={20} />
              <SkeletonBar width={40} height={14} style={{ marginLeft: 6 }} />
            </View>
            <SkeletonBar width="20%" height={16} />
          </View>
          <SkeletonBar width="60%" height={12} style={{ marginTop: 8 }} />
          <SkeletonBar width="40%" height={11} style={{ marginTop: 4 }} />
        </View>
      ))}
    </View>
  );
}
export function ConfigManageSkeleton() {
  return (
    <View style={s.page}>
      {/* 费率配置卡片 */}
      <View style={s.configCard}>
        <View style={s.configRow}>
          <SkeletonBar width="20%" height={14} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <SkeletonBar width={50} height={14} />
            <SkeletonCircle size={18} />
          </View>
        </View>
        <View style={s.configDivider} />
        <View style={s.configRow}>
          <SkeletonBar width="25%" height={14} />
          <SkeletonBar width="35%" height={14} />
        </View>
        <View style={s.configDivider} />
        <SkeletonBar width="80%" height={12} style={{ marginTop: 10 }} />
        <SkeletonBar width="60%" height={12} style={{ marginTop: 4 }} />
      </View>

      {/* 交易限制卡片 */}
      <View style={[s.configCard, { marginTop: 16 }]}>
        <View style={s.configRow}>
          <SkeletonBar width="40%" height={14} />
          <SkeletonBar width={44} height={24} borderRadius={12} />
        </View>
        <View style={s.configDivider} />
        <SkeletonBar width="70%" height={12} style={{ marginTop: 10 }} />
      </View>

      {/* 充值管理入口 */}
      <View style={[s.configCard, { marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
        <SkeletonBar width="25%" height={14} />
        <SkeletonBar width={18} height={18} />
      </View>

      {/* 代币管理入口 */}
      <View style={[s.configCard, { marginTop: 12 }]}>
        <View style={s.configRow}>
          <SkeletonBar width="25%" height={14} />
          <SkeletonBar width={18} height={18} />
        </View>
        <View style={s.configDivider} />
        <SkeletonBar width="75%" height={12} style={{ marginTop: 10 }} />
      </View>
    </View>
  );
}

/** Token manage list skeleton */
export function TokenManageSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={s.page}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={s.tokenCard}>
          <SkeletonCircle size={40} />
          <View style={s.tokenInfo}>
            <SkeletonBar width="30%" height={16} />
            <SkeletonBar width="55%" height={12} style={{ marginTop: 6 }} />
          </View>
          <SkeletonBar width={44} height={24} borderRadius={12} />
        </View>
      ))}
    </View>
  );
}

/** Recharge screen skeleton */
export function RechargeSkeleton() {
  return (
    <View style={s.page}>
      {/* Form card skeleton */}
      <View style={s.rechargeFormCard}>
        <SkeletonBar width="30%" height={18} style={{ marginBottom: 16 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={{ marginBottom: 14 }}>
            <SkeletonBar width="20%" height={12} style={{ marginBottom: 6 }} />
            <SkeletonBar width="100%" height={44} borderRadius={10} />
          </View>
        ))}
        <SkeletonBar width="100%" height={46} borderRadius={10} style={{ marginTop: 6 }} />
      </View>
      {/* Records header skeleton */}
      <SkeletonBar width="25%" height={16} style={{ marginBottom: 10 }} />
      {/* Record cards skeleton */}
      {Array.from({ length: 3 }).map((_, i) => (
        <View key={i} style={s.rechargeRecordCard}>
          <View style={s.rechargeRecordTop}>
            <View style={s.rechargeRecordLeft}>
              <SkeletonCircle size={20} />
              <SkeletonBar width={40} height={14} style={{ marginLeft: 6 }} />
            </View>
            <SkeletonBar width="20%" height={16} />
          </View>
          <SkeletonBar width="60%" height={12} style={{ marginTop: 8 }} />
          <SkeletonBar width="40%" height={11} style={{ marginTop: 4 }} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 16 },
  // Wallet
  walletCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  walletRow: { flexDirection: "row", alignItems: "center" },
  walletInfo: { flex: 1, marginLeft: 12 },
  // Token
  tokenCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  tokenInfo: { flex: 1, marginLeft: 12 },
  // Detail
  detailCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  // Account
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  accountInfo: { flex: 1, marginLeft: 12 },
  // Contact
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  contactInfo: { flex: 1, marginLeft: 12 },
  // Transaction
  txCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  txTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  txLabelWrap: { flexDirection: "row", alignItems: "center" },
  txMiddleRow: { flexDirection: "row", marginTop: 8 },
  txBottomRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  // Notification
  notifCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  notifInfo: { flex: 1, marginLeft: 8 },
  // Config manage
  configCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  configRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  configDivider: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 0 },
  // Recharge
  rechargeFormCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  rechargeRecordCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rechargeRecordTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rechargeRecordLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
});
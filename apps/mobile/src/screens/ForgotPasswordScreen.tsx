import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";
import Svg, { Path, Circle } from "react-native-svg";

type Nav = NativeStackNavigationProp<RootStackParamList, "ForgotPassword">;
type RouteType = RouteProp<RootStackParamList, "ForgotPassword">;

/** Password lock icon */
function PasswordLockIcon({ size = 80 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path
        d="M512 1024C229.233778 1024 0 794.766222 0 512S229.233778 0 512 0s512 229.233778 512 512-229.233778 512-512 512z"
        fill="#007AFF"
      />
      <Path
        d="M512 284.444444c61.767111 0 112.042667 46.108444 113.735111 103.594667l0.042667 2.986667v21.873778c0 11.761778-10.183111 21.304889-22.755556 21.304888-11.989333 0-21.831111-8.689778-22.698666-19.726222l-0.056889-1.578666v-21.873778c0-35.313778-30.563556-63.943111-68.266667-63.943111-36.835556 0-66.872889 27.335111-68.224 61.539555l-0.042667 2.403556L443.719111 483.555556h187.946667c28.501333 0 51.399111 21.461333 51.000889 48.184888v160h-0.412445c0 26.353778-22.883556 47.815111-50.986666 47.815112h-238.933334C364.216889 739.555556 341.333333 718.094222 341.333333 691.740444v-160c0-26.353778 22.897778-47.815111 51.000889-47.815111l5.888-0.056889v-92.842666C398.222222 332.16 449.166222 284.444444 512 284.444444z m4.849778 270.222223A33.28 33.28 0 0 0 483.555556 587.960889c0 12.145778 6.656 23.111111 16.455111 28.586667v38.001777c0 9.016889 7.438222 16.455111 16.455111 16.455111 9.002667 0 16.455111-7.438222 16.455111-16.455111v-37.987555c9.784889-5.888 16.839111-16.455111 16.839111-28.586667A32.696889 32.696889 0 0 0 516.849778 554.666667z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

/** Shield verify icon (icon1) */
function ShieldVerifyIcon({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        d="M6 9.3L24 4L42 9.3V20C42 31.4 34.8 41.4 24 45C13.3 41.4 6 31.4 6 20V9.3Z"
        fill="none"
        stroke="#1296DB"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <Path
        d="M15 23L22 30L34 18"
        stroke="#1296DB"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Key reset icon (icon2) */
function KeyResetIcon({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path
        d="M512 0c282.8 0 512 229.2 512 512S794.8 1024 512 1024 0 794.8 0 512 229.2 0 512 0z m91.4 256a164.6 164.6 0 0 0-164.6 164.6 163.4 163.4 0 0 0 26.3 88.7l-198.8 198.8a35.1 35.1 0 1 0 49.6 49.6l63.7-63.7 32.8 32.8a15.2 15.2 0 1 0 21.5-21.5l-32.8-32.8 51.6-51.6 32.8 32.8a15.2 15.2 0 0 0 21.5-21.5l-32.8-32.8 40.4-40.4a163.7 163.7 0 0 0 88.7 26.3 164.6 164.6 0 0 0 0-329.2z m4.6 106.7a53.3 53.3 0 0 1 0 106.7 53.3 53.3 0 0 1 0-106.7z"
        fill="#1296DB"
      />
    </Svg>
  );
}

const APP_NAME = "AquaD";

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const walletId = route.params?.walletId;

  const handleResetPassword = () => {
    if (!walletId) return;
    navigation.navigate("ResetPassword", { walletId });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Password lock icon */}
      <View style={styles.iconWrap}>
        <PasswordLockIcon size={80} />
      </View>

      {/* Title */}
      <Text style={styles.title}>忘记密码？</Text>

      {/* Description */}
      <Text style={styles.description}>
        {APP_NAME}不会存储你的钱包密码。如果你忘记了密码或想创建一个新密码，你可以通过提供正确的助记词或私钥来重置密码。
      </Text>
      <Text style={styles.descriptionNote}>
        请注意，通过 Keystore 导入的钱包不支持密码重置。
      </Text>

      {/* Step items */}
      <View style={styles.stepCard}>
        {/* Step 1: Verify */}
        <View style={styles.stepItem}>
          <View style={styles.stepIconWrap}>
            <ShieldVerifyIcon size={24} />
          </View>
          <View style={styles.stepTextWrap}>
            <Text style={styles.stepTitle}>验证</Text>
            <Text style={styles.stepDesc}>提供助记词或私钥</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.stepDivider} />

        {/* Step 2: Create new password */}
        <View style={styles.stepItem}>
          <View style={styles.stepIconWrap}>
            <KeyResetIcon size={24} />
          </View>
          <View style={styles.stepTextWrap}>
            <Text style={styles.stepTitle}>创建新密码</Text>
            <Text style={styles.stepDesc}>请妥善保管，仅供自己使用</Text>
          </View>
        </View>
      </View>

      {/* Reset password button */}
      <TouchableOpacity
        style={styles.resetBtn}
        onPress={handleResetPassword}
        activeOpacity={0.7}
      >
        <Text style={styles.resetBtnText}>重置密码</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  iconWrap: {
    marginBottom: 24,
    alignItems: "flex-start",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "left",
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "left",
    lineHeight: 22,
    marginBottom: 8,
  },
  descriptionNote: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "left",
    lineHeight: 22,
    marginBottom: 32,
  },
  stepCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 32,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EBF5FF",
    justifyContent: "center",
    alignItems: "center",
  },
  stepTextWrap: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 13,
    color: "#6B7280",
  },
  stepDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 16,
  },
  resetBtn: {
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
  },
  resetBtnText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
});
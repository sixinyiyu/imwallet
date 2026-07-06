import { useEffect } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MainTabs } from "./MainTabs";
import StartScreen from "../screens/StartScreen";
import WalletCreateScreen from "../screens/WalletCreateScreen";
import WalletImportScreen from "../screens/WalletImportScreen";
import WalletAddAccountScreen from "../screens/WalletAddAccountScreen";
import BackupConfirmScreen from "../screens/BackupConfirmScreen";
import BackupGuideScreen from "../screens/BackupGuideScreen";
import BackupMnemonicScreen from "../screens/BackupMnemonicScreen";
import ConfirmMnemonicScreen from "../screens/ConfirmMnemonicScreen";
import TokenDetailScreen from "../screens/TokenDetailScreen";
import TransferScreen from "../screens/TransferScreen";
import ReceiveScreen from "../screens/ReceiveScreen";
import RecordsScreen from "../screens/RecordsScreen";
import WalletManageScreen from "../screens/WalletManageScreen";
import WalletDetailScreen from "../screens/WalletDetailScreen";
import AddressBookScreen from "../screens/AddressBookScreen";
import SettingsScreen from "../screens/SettingsScreen";
import ServiceConfigScreen from "../screens/ServiceConfigScreen";
import ConfigManageScreen from "../screens/ConfigManageScreen";
import DeviceManageScreen from "../screens/DeviceManageScreen";
import RechargeScreen from "../screens/RechargeScreen";
import TokenManageScreen from "../screens/TokenManageScreen";
import SecurityScreen from "../screens/SecurityScreen";
import AboutScreen from "../screens/AboutScreen";
import FeedbackScreen from "../screens/FeedbackScreen";
import ScanScreen from "../screens/ScanScreen";
import TradeDetailScreen from "../screens/TradeDetailScreen";
import NotificationScreen from "../screens/NotificationScreen";
import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import { RootStackParamList } from "../types/navigation";
import { useWalletStore } from "../stores/walletStore";

const Stack = createNativeStackNavigator<RootStackParamList>();

const CENTERED_HEADER = {
  headerShown: true,
  headerTitleAlign: "center" as const,
};

export function RootStack() {
  const { hasWallets, hasFetched, accountCount, loadLocalState } = useWalletStore();

  useEffect(() => {
    loadLocalState();
  }, []);

  // Wait for local state to load before rendering navigator
  if (!hasFetched) {
    return null;
  }

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={!hasWallets ? "Start" : accountCount === 0 ? "WalletAddAccount" : "Main"}
    >
      {/* Start screen - always available */}
      <Stack.Screen name="Start" component={StartScreen} />

      {/* Wallet creation/import screens */}
      <Stack.Screen name="WalletCreate" component={WalletCreateScreen} options={{ headerShown: true, headerTitle: "", headerBackTitle: "", headerTintColor: "#374151" }} />
      <Stack.Screen name="WalletImport" component={WalletImportScreen} options={{ headerShown: true, headerTitle: "", headerBackTitle: "", headerTintColor: "#374151" }} />
      <Stack.Screen
        name="WalletAddAccount"
        component={WalletAddAccountScreen}
        options={{ ...CENTERED_HEADER, title: "添加账户" }}
      />
      <Stack.Screen
        name="BackupConfirm"
        component={BackupConfirmScreen}
        options={{ ...CENTERED_HEADER, title: "备份确认" }}
      />
      <Stack.Screen
        name="BackupGuide"
        component={BackupGuideScreen}
        options={{ headerShown: true, headerTitle: "", headerBackTitle: "", headerTintColor: "#374151" }}
      />
      <Stack.Screen
        name="BackupMnemonic"
        component={BackupMnemonicScreen}
        options={{ headerShown: true, headerTitle: "", headerBackTitle: "", headerTintColor: "#374151" }}
      />
      <Stack.Screen
        name="ConfirmMnemonic"
        component={ConfirmMnemonicScreen}
        options={{ headerShown: true, headerTitle: "", headerBackTitle: "", headerTintColor: "#374151" }}
      />

      {/* Main app screens */}
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen
        name="Scan"
        component={ScanScreen}
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="TradeDetail"
        component={TradeDetailScreen}
        options={{ ...CENTERED_HEADER, title: "交易详情" }}
      />
      <Stack.Screen
        name="TokenDetail"
        component={TokenDetailScreen}
        options={{ ...CENTERED_HEADER, title: "代币详情" }}
      />
      <Stack.Screen
        name="Transfer"
        component={TransferScreen}
        options={{ ...CENTERED_HEADER, title: "转账" }}
      />
      <Stack.Screen
        name="Receive"
        component={ReceiveScreen}
        options={{ ...CENTERED_HEADER, title: "收款" }}
      />
      <Stack.Screen
        name="Records"
        component={RecordsScreen}
        options={{ ...CENTERED_HEADER, title: "交易记录" }}
      />
      <Stack.Screen
        name="WalletManage"
        component={WalletManageScreen}
        options={{ ...CENTERED_HEADER, title: "钱包管理" }}
      />
      <Stack.Screen
        name="WalletDetail"
        component={WalletDetailScreen}
        options={{ ...CENTERED_HEADER, title: "钱包详情" }}
      />
      <Stack.Screen
        name="AddressBook"
        component={AddressBookScreen}
        options={{ ...CENTERED_HEADER, title: "地址本" }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ ...CENTERED_HEADER, title: "通用设置" }}
      />
      <Stack.Screen
        name="ServiceConfig"
        component={ServiceConfigScreen}
        options={{ ...CENTERED_HEADER, title: "服务配置" }}
      />
      <Stack.Screen
        name="ConfigManage"
        component={ConfigManageScreen}
        options={{ ...CENTERED_HEADER, title: "配置管理" }}
      />
      <Stack.Screen
        name="Recharge"
        component={RechargeScreen}
        options={{ ...CENTERED_HEADER, title: "充值管理" }}
      />
      <Stack.Screen
        name="TokenManage"
        component={TokenManageScreen}
        options={{ ...CENTERED_HEADER, title: "代币管理" }}
      />
      <Stack.Screen
        name="DeviceManage"
        component={DeviceManageScreen}
        options={{ ...CENTERED_HEADER, title: "设备列表" }}
      />
      <Stack.Screen
        name="Security"
        component={SecurityScreen}
        options={{ ...CENTERED_HEADER, title: "安全与隐私" }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{ ...CENTERED_HEADER, title: "关于我们" }}
      />
      <Stack.Screen
        name="Feedback"
        component={FeedbackScreen}
        options={{ ...CENTERED_HEADER, title: "反馈与建议" }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationScreen}
        options={{ ...CENTERED_HEADER, title: "消息通知" }}
      />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ ...CENTERED_HEADER, title: "忘记密码" }}
      />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{ ...CENTERED_HEADER, title: "重置密码" }}
      />
    </Stack.Navigator>
  );
}
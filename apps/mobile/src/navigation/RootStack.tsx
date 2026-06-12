import React, { useEffect } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MainTabs } from "./MainTabs";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import WalletCreateScreen from "../screens/WalletCreateScreen";
import TokenDetailScreen from "../screens/TokenDetailScreen";
import TransferScreen from "../screens/TransferScreen";
import ReceiveScreen from "../screens/ReceiveScreen";
import RecordsScreen from "../screens/RecordsScreen";
import WalletManageScreen from "../screens/WalletManageScreen";
import AddressBookScreen from "../screens/AddressBookScreen";
import SettingsScreen from "../screens/SettingsScreen";
import SecurityScreen from "../screens/SecurityScreen";
import AboutScreen from "../screens/AboutScreen";
import ScanScreen from "../screens/ScanScreen";
import TradeDetailScreen from "../screens/TradeDetailScreen";
import AdminScreen from "../screens/AdminScreen";
import UserManageScreen from "../screens/UserManageScreen";
import NotificationScreen from "../screens/NotificationScreen";
import { RootStackParamList } from "../types/navigation";
import { useAuthStore } from "../stores/authStore";

const Stack = createNativeStackNavigator<RootStackParamList>();

const CENTERED_HEADER = {
  headerShown: true,
  headerTitleAlign: "center" as const,
};

export function RootStack() {
  const { isLoggedIn, loading, loadSession } = useAuthStore();

  useEffect(() => {
    loadSession();
  }, []);

  if (loading) {
    return null; // Wait for session to load
  }

  return (
    <Stack.Navigator
      key={isLoggedIn ? "main" : "auth"}
      screenOptions={{ headerShown: false }}
      initialRouteName={isLoggedIn ? "Main" : "Login"}
    >
      {!isLoggedIn ? (
        // Auth screens
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : (
        // Main app screens
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="WalletCreate" component={WalletCreateScreen} />
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
            name="Admin"
            component={AdminScreen}
            options={{ ...CENTERED_HEADER, title: "管理" }}
          />
          <Stack.Screen
            name="UserManage"
            component={UserManageScreen}
            options={{ ...CENTERED_HEADER, title: "用户管理" }}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationScreen}
            options={{ ...CENTERED_HEADER, title: "消息通知" }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
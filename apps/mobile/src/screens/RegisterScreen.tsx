import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";


type Nav = NativeStackNavigationProp<RootStackParamList>;

/** RegisterScreen is no longer used — device-based auth replace JWT register. * This screen is kept as a stub to avoid breaking any residual navigation references. */
export default function RegisterScreen() {
  const navigation = useNavigation<Nav>();
  // Device auth: no register needed, navigate to Start
  React.useEffect(() => {
    navigation.replace("Start",  );
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>设备认证已启用，无需注册</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F9FAFB" },
  text: { fontSize: 16, color: "#6B7280" },
});
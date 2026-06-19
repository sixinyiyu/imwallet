import { useAppAlert } from "../components/AppAlert";

/**
 * Convenience hook: returns a drop-in replacement for Alert.alert
 * that works on both native and web platforms.
 *
 * Usage:
 *   const alert = useAlert();
 *   alert("提示", "请输入名称");
 *   alert("确认删除", "确定删除吗？", [
 *     { text: "取消", style: "cancel" },
 *     { text: "删除", style: "destructive", onPress: () => doDelete() },
 *   ]);
 */
export function useAlert() {
  const { showAlert } = useAppAlert();

  return (
    title: string,
    message?: string,
    buttons?: Array<{
      text: string;
      style?: "default" | "cancel" | "destructive";
      onPress?: () => void | Promise<void>;
    }>
  ) => {
    showAlert({ title, message, buttons });
  };
}

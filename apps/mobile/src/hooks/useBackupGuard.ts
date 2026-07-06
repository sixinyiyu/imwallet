import { useState } from "react";
import { useWalletStore } from "../stores/walletStore";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../types/navigation";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export type GuardType = "backup" | "readonly";

/**
 * 备份检查 hook — 在转账/收款等操作前检查钱包是否已备份
 *
 * 对于订阅钱包（isReadOnly），弹出"只读钱包无法转账"提示
 * 对于未备份的本地钱包，弹出"请先备份"提示
 */
export function useBackupGuard(walletId: string | undefined) {
  const backedUpWallets = useWalletStore((s) => s.backedUpWallets);
  const wallets = useWalletStore((s) => s.wallets);
  const [showGuard, setShowGuard] = useState(false);

  const wallet = walletId ? wallets.find((w) => w.id === walletId) : undefined;
  const isReadOnly = wallet?.isReadOnly ?? false;
  const isBackedUp = walletId ? backedUpWallets.has(walletId) : true;

  // 订阅钱包 → readonly 类型；本地钱包未备份 → backup 类型；已备份 → 不弹窗
  const guardType: GuardType | null = isReadOnly ? "readonly" : (!isBackedUp ? "backup" : null);

  /** 检查是否可以继续操作：通过返回 true，阻拦返回 false 并弹窗 */
  const guardCheck = (): boolean => {
    if (guardType) {
      setShowGuard(true);
      return false;
    }
    return true;
  };

  const closeGuard = () => setShowGuard(false);

  /** 导航到备份引导页（仅 backup 类型有效，readonly 类型无备份页） */
  const goToBackup = (navigation: Nav) => {
    setShowGuard(false);
    if (walletId && guardType === "backup") {
      navigation.navigate("BackupGuide", { walletId, source: "guard" });
    }
  };

  return { guardCheck, showGuard, closeGuard, goToBackup, isBackedUp, guardType };
}

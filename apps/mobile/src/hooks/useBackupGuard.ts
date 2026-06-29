import { useState } from "react";
import { useWalletStore } from "../stores/walletStore";

/**
 * 备份检查 hook — 在转账/收款等操作前检查钱包是否已备份
 *
 * 使用方式：
 *   const { guardCheck, showGuard, closeGuard, goToBackup } = useBackupGuard(walletId);
 *   // 操作前调用 guardCheck()，返回 true 表示已备份可继续，false 表示未备份已弹窗
 *   // 在组件中渲染 <BackupGuardModal visible={showGuard} ... />
 */
export function useBackupGuard(walletId: string | undefined) {
  const backedUpWallets = useWalletStore((s) => s.backedUpWallets);
  const [showGuard, setShowGuard] = useState(false);

  const isBackedUp = walletId ? backedUpWallets.has(walletId) : true;

  /** 检查备份状态：已备份返回 true，未备份弹出提示返回 false */
  const guardCheck = (): boolean => {
    if (!isBackedUp) {
      setShowGuard(true);
      return false;
    }
    return true;
  };

  const closeGuard = () => setShowGuard(false);

  /** 导航到备份引导页（需在组件中配合 navigation 使用） */
  const goToBackup = (navigation: any) => {
    setShowGuard(false);
    if (walletId) {
      navigation.navigate("BackupGuide", { walletId, source: "guard" as any });
    }
  };

  return { guardCheck, showGuard, closeGuard, goToBackup, isBackedUp };
}

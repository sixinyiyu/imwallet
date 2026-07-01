export { default as TransferIcon } from "./TransferIcon";
export { default as ReceiveIcon } from "./ReceiveIcon";
export { default as RecordsIcon } from "./RecordsIcon";
export { default as WalletIcon } from "./WalletIcon";
export { default as AboutIcon } from "./AboutIcon";
export { default as USDTIcon } from "./USDTIcon";
export { default as ScanIcon } from "./ScanIcon";
export { default as ProfileIcon } from "./ProfileIcon";
export { default as CopyIcon } from "./CopyIcon";
export { default as ShareIcon } from "./ShareIcon";
export { default as ContactIcon } from "./ContactIcon";
export { default as SuccessIcon } from "./SuccessIcon";
export { default as FailureIcon } from "./FailureIcon";
export { default as PendingIcon } from "./PendingIcon";
export { default as SearchIcon } from "./SearchIcon";
export { default as UserIcon } from "./UserIcon";
export { default as TronIcon } from "./TronIcon";
export { default as EyeIcon } from "./EyeIcon";
export { default as EyeOffIcon } from "./EyeOffIcon";
export { default as ChevronRightIcon } from "./ChevronRightIcon";
export { default as PlusCircleIcon } from "./PlusCircleIcon";
export { default as EditIcon } from "./EditIcon";
export { default as CameraIcon } from "./CameraIcon";
export { default as NoScreenshotIcon } from "./NoScreenshotIcon";
export { default as WarningIcon } from "./WarningIcon";
export { default as EthIcon } from "./EthIcon";
export { default as BtcIcon } from "./BtcIcon";
export { default as AddContactIcon } from "./AddContactIcon";
export { default as AndroidIcon } from "./AndroidIcon";
export { default as IosIcon } from "./IosIcon";
export { default as SubscribeIcon } from "./SubscribeIcon";

import React from "react";
import { Text } from "react-native";
import TronIcon from "./TronIcon";
import USDTIcon from "./USDTIcon";
import EthIcon from "./EthIcon";
import BtcIcon from "./BtcIcon";

/** 预置代币图标映射（统一入口，避免各 Screen 重复定义） */
export const TOKEN_ICONS: Record<string, React.FC<{ size?: number }>> = {
  TRX: TronIcon,
  USDT: USDTIcon,
  ETH: EthIcon,
  BTC: BtcIcon,
};

/** 根据代币 symbol 渲染图标，未知代币回退为 null 或 emoji */
export function renderTokenIcon(symbol: string | undefined, size: number, fallback: string | null = null) {
  if (!symbol) return fallback ? <Text style={{ fontSize: size * 0.7 }}>{fallback}</Text> : null;
  const Icon = TOKEN_ICONS[symbol];
  if (Icon) return React.createElement(Icon, { size });
  if (fallback) return <Text style={{ fontSize: size * 0.7 }}>{fallback}</Text>;
  return null;
}
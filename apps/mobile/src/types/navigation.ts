import { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParamList = {
  Start: undefined;
  WalletCreate: undefined;
  WalletImport: undefined;
  WalletAddAccount: { walletId: string };
  Main: NavigatorScreenParams<MainTabParamList>;
  Scan: undefined;
  TradeDetail: { tradeId: string };
  TokenDetail: { tokenSymbol: string };
  Transfer: { walletId?: string; tokenSymbol?: string; tokenId?: string; toAddress?: string };
  Receive: { walletId?: string; tokenSymbol?: string; tokenId?: string };
  Records: { walletId?: string; tokenSymbol?: string };
  WalletManage: undefined;
  WalletDetail: { walletId: string };
  AccountManage: { walletId: string };
  AddressBook: { selectMode?: boolean; onSelectAddress?: string } | undefined;
  Settings: undefined;
  Security: undefined;
  About: undefined;
  Notifications: undefined;
  BackupConfirm: { walletId: string };
  BackupGuide: { walletId: string; source?: "create" | "detail" };
  BackupMnemonic: { walletId: string };
  ConfirmMnemonic: { walletId: string; mnemonic: string };
  ForgotPassword: { walletId: string };
  ResetPassword: { walletId: string };
};

export type MainTabParamList = {
  Wallet: undefined;
  Profile: undefined;
};
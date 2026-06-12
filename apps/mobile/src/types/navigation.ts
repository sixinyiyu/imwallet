import { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  WalletCreate: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  Scan: undefined;
  TradeDetail: { tradeId: string };
  TokenDetail: { tokenSymbol: string };
  Transfer: { walletId?: string; tokenSymbol?: string; tokenId?: string; toAddress?: string };
  Receive: { walletId?: string; tokenSymbol?: string; tokenId?: string };
  Records: { walletId?: string };
  WalletManage: undefined;
  AddressBook: { selectMode?: boolean; onSelectAddress?: string } | undefined;
  Settings: undefined;
  Security: undefined;
  About: undefined;
  Admin: undefined;
  UserManage: undefined;
  Notifications: undefined;
};

export type MainTabParamList = {
  Wallet: undefined;
  Profile: undefined;
};

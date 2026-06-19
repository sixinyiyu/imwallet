// CRITICAL: This polyfill MUST be imported FIRST before any module that uses
// crypto.getRandomValues (e.g., @noble/ed25519, mnemonic.ts, api.ts).
// Without it, crypto.getRandomValues is undefined in React Native native env,
// causing immediate crash on app startup.
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

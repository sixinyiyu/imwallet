package com.aquad.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.preference.PreferenceManager;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.util.Base64;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.module.annotations.ReactModule;

import org.json.JSONException;
import org.json.JSONObject;

import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * SecureStore Compatibility Reader — reads expo-secure-store data using BOTH
 * old (v55) and new (v56) KeyStore aliases, ensuring data is never deleted on failure.
 *
 * expo-secure-store v56 changed the KeyStore alias format:
 *   - v55 alias: "AES/GCM/NoPadding:key_v1"                    (no suffix)
 *   - v56 alias: "AES/GCM/NoPadding:key_v1_keystoreUnauthenticated" (with suffix)
 *
 * When v56 tries to decrypt old-format data (usesKeystoreSuffix=false) with the old alias,
 * it can succeed IF the old alias still exists in AndroidKeyStore. But if the old alias
 * is missing (e.g. after app reinstall), v56 catches the error and **deletes the
 * SharedPreferences entry, returning null** — the data is permanently lost.
 *
 * This module prevents that data loss by:
 * 1. Reading encrypted JSON from SharedPreferences (both old-format key and new-format
 *    keychainAwareKey)
 * 2. Determining which KeyStore alias to use based on the usesKeystoreSuffix field
 * 3. Decrypting with the appropriate alias — old or new
 * 4. Returning the plaintext — WITHOUT deleting the data on failure
 *
 * After successful decryption, the caller should use expo-secure-store's setItemAsync to
 * write the value back, which automatically stores it in the new format and deletes the old key.
 */
@ReactModule(name = SecureStoreLegacyModule.NAME)
public class SecureStoreLegacyModule extends ReactContextBaseJavaModule {
  public static final String NAME = "SecureStoreLegacy";
  private static final String TAG = "SecureStoreLegacy";

  // SharedPreferences file name used by expo-secure-store
  private static final String SECURE_STORE_PREFS_NAME = "SecureStore";

  // KeyStore aliases — both old (v55) and new (v56) formats
  private static final String OLD_KEYSTORE_ALIAS = "AES/GCM/NoPadding:key_v1";
  private static final String NEW_KEYSTORE_ALIAS_UNAUTHENTICATED = "AES/GCM/NoPadding:key_v1_keystoreUnauthenticated";
  private static final String NEW_KEYSTORE_ALIAS_AUTHENTICATED = "AES/GCM/NoPadding:key_v1_keystoreAuthenticated";

  // Default keychainService used by expo-secure-store (same as SecureStoreModule.DEFAULT_KEYSTORE_ALIAS)
  private static final String DEFAULT_KEYCHAIN_SERVICE = "key_v1";

  // JSON property names used by expo-secure-store's AESEncryptor
  private static final String CIPHERTEXT_PROPERTY = "ct";
  private static final String IV_PROPERTY = "iv";
  private static final String GCM_AUTH_TAG_LENGTH_PROPERTY = "tlen";
  private static final String SCHEME_PROPERTY = "scheme";
  private static final String AES_SCHEME = "aes";
  private static final String USES_KEYSTORE_SUFFIX_PROPERTY = "usesKeystoreSuffix";
  private static final String KEYSTORE_ALIAS_PROPERTY = "keystoreAlias";
  private static final String REQUIRE_AUTHENTICATION_PROPERTY = "requireAuthentication";

  // KeyStore provider
  private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";

  public SecureStoreLegacyModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  /**
   * Read an expo-secure-store entry and decrypt it using the appropriate KeyStore alias.
   *
   * This method checks BOTH the old-format key (no keychainService prefix) and the new-format
   * key (with keychainService prefix) in SharedPreferences. It then determines which KeyStore
   * alias to use based on the usesKeystoreSuffix field in the encrypted JSON:
   *   - usesKeystoreSuffix=false (or absent) → use old alias (v55 format)
   *   - usesKeystoreSuffix=true → use new alias (v56 format, with suffix)
   *
   * On ANY failure, this method returns null WITHOUT deleting the data. This is the critical
   * difference from expo-secure-store v56's getItemImpl, which deletes data on decryption failure.
   *
   * @param key     The SecureStore key (e.g. "imwallet_device_public_key")
   * @param promise React Native Promise — resolves to plaintext string, or null if not found/unable to decrypt
   */
  @ReactMethod
  public void readLegacyValue(String key, Promise promise) {
    try {
      Context context = getReactApplicationContext();
      SharedPreferences secureStorePrefs = context.getSharedPreferences(SECURE_STORE_PREFS_NAME, Context.MODE_PRIVATE);

      // 1. Try to find encrypted data in SharedPreferences
      //    v56 stores data under "keychainService-key" (keychainAwareKey)
      //    v55 stores data under the raw key (no prefix)
      //    We check BOTH, preferring the new-format keychainAwareKey

      String keychainAwareKey = DEFAULT_KEYCHAIN_SERVICE + "-" + key;
      String encryptedItemString = secureStorePrefs.getString(keychainAwareKey, null);

      if (encryptedItemString == null) {
        // Fallback: check old-format key (no keychainService prefix)
        encryptedItemString = secureStorePrefs.getString(key, null);
      }

      if (encryptedItemString == null) {
        // Fallback: check PreferenceManager (very old expo-secure-store versions)
        SharedPreferences defaultPrefs = PreferenceManager.getDefaultSharedPreferences(context);
        encryptedItemString = defaultPrefs.getString(key, null);
      }

      if (encryptedItemString == null) {
        Log.d(TAG, "No data found for key: " + key);
        promise.resolve(null);
        return;
      }

      // 2. Parse the encrypted JSON
      JSONObject encryptedItem;
      try {
        encryptedItem = new JSONObject(encryptedItemString);
      } catch (JSONException e) {
        Log.w(TAG, "Could not parse JSON for key: " + key);
        promise.resolve(null);
        return;
      }

      // 3. Check scheme — only AES is supported
      String scheme = encryptedItem.optString(SCHEME_PROPERTY, "");
      if (!scheme.equals(AES_SCHEME)) {
        Log.w(TAG, "Data has unsupported scheme: " + scheme + " for key: " + key);
        promise.resolve(null);
        return;
      }

      // 4. Determine which KeyStore alias to use based on usesKeystoreSuffix
      boolean usesKeystoreSuffix = encryptedItem.optBoolean(USES_KEYSTORE_SUFFIX_PROPERTY, false);
      boolean requireAuthentication = encryptedItem.optBoolean(REQUIRE_AUTHENTICATION_PROPERTY, false);

      // If keystoreAlias is specified in the JSON, we could use a custom keychainService.
      // But for our app, we always use the default "key_v1", so we only need the standard aliases.
      String keystoreAlias;
      if (usesKeystoreSuffix) {
        // v56 format — use the new alias with suffix
        keystoreAlias = requireAuthentication
          ? NEW_KEYSTORE_ALIAS_AUTHENTICATED
          : NEW_KEYSTORE_ALIAS_UNAUTHENTICATED;
      } else {
        // v55 format — use the old alias without suffix
        keystoreAlias = OLD_KEYSTORE_ALIAS;
      }

      // 5. Extract ciphertext, IV, and authentication tag length
      String ciphertextBase64 = encryptedItem.getString(CIPHERTEXT_PROPERTY);
      String ivBase64 = encryptedItem.getString(IV_PROPERTY);
      int authTagLength = encryptedItem.getInt(GCM_AUTH_TAG_LENGTH_PROPERTY);

      byte[] ciphertextBytes = Base64.decode(ciphertextBase64, Base64.DEFAULT);
      byte[] ivBytes = Base64.decode(ivBase64, Base64.DEFAULT);

      // 6. Get the SecretKey from AndroidKeyStore using the determined alias
      KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
      keyStore.load(null);

      // First try the determined alias; if it doesn't exist, try the other one as fallback
      // This handles edge cases where the data format and KeyStore alias are mismatched
      KeyStore.Entry entry = tryGetKeyEntry(keyStore, keystoreAlias);
      if (entry == null) {
        // Fallback: try the opposite alias
        String fallbackAlias = usesKeystoreSuffix ? OLD_KEYSTORE_ALIAS : NEW_KEYSTORE_ALIAS_UNAUTHENTICATED;
        Log.w(TAG, "Primary alias not found: " + keystoreAlias + ", trying fallback: " + fallbackAlias);
        entry = tryGetKeyEntry(keyStore, fallbackAlias);
      }

      if (entry == null) {
        Log.w(TAG, "No KeyStore entry found for any alias for key: " + key);
        promise.resolve(null);
        return;
      }

      if (!(entry instanceof KeyStore.SecretKeyEntry)) {
        Log.w(TAG, "KeyStore entry is not a SecretKey for key: " + key);
        promise.resolve(null);
        return;
      }

      SecretKey secretKey = ((KeyStore.SecretKeyEntry) entry).getSecretKey();

      // 7. Decrypt using AES/GCM/NoPadding
      //    If the determined alias doesn't match the actual encryption key, decryption will fail.
      //    In that case, try the fallback alias.
      String plaintext = null;
      String[] aliasOrder = usesKeystoreSuffix
        ? new String[]{NEW_KEYSTORE_ALIAS_UNAUTHENTICATED, OLD_KEYSTORE_ALIAS}
        : new String[]{OLD_KEYSTORE_ALIAS, NEW_KEYSTORE_ALIAS_UNAUTHENTICATED};

      for (String alias : aliasOrder) {
        KeyStore.Entry tryEntry = tryGetKeyEntry(keyStore, alias);
        if (tryEntry == null || !(tryEntry instanceof KeyStore.SecretKeyEntry)) continue;

        SecretKey tryKey = ((KeyStore.SecretKeyEntry) tryEntry).getSecretKey();
        try {
          GCMParameterSpec gcmSpec = new GCMParameterSpec(authTagLength, ivBytes);
          Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
          cipher.init(Cipher.DECRYPT_MODE, tryKey, gcmSpec);

          byte[] decryptedBytes = cipher.doFinal(ciphertextBytes);
          plaintext = new String(decryptedBytes, "UTF-8");
          Log.i(TAG, "Successfully decrypted value for key: " + key
            + " using alias: " + alias
            + " (length=" + plaintext.length() + ")");
          break; // Success — no need to try other aliases
        } catch (Exception e) {
          Log.w(TAG, "Decryption failed with alias: " + alias + " for key: " + key + ": " + e.getMessage());
          // Continue to try the next alias
        }
      }

      promise.resolve(plaintext);

    } catch (KeyPermanentlyInvalidatedException e) {
      Log.w(TAG, "KeyStore key has been permanently invalidated for key: " + key);
      promise.resolve(null);
    } catch (Exception e) {
      Log.w(TAG, "Failed to read value for key: " + key + ": " + e.getMessage());
      // Return null instead of throwing — we don't want to crash the app or delete the data
      promise.resolve(null);
    }
  }

  /**
   * Try to get a KeyStore entry for the given alias.
   * Returns null if the alias doesn't exist or the entry is not accessible.
   */
  private KeyStore.Entry tryGetKeyEntry(KeyStore keyStore, String alias) {
    try {
      if (!keyStore.containsAlias(alias)) {
        return null;
      }
      return keyStore.getEntry(alias, null);
    } catch (Exception e) {
      Log.w(TAG, "Failed to get KeyStore entry for alias: " + alias + ": " + e.getMessage());
      return null;
    }
  }
}

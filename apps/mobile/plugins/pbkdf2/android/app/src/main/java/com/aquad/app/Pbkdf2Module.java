package com.aquad.app;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.Promise;
import com.facebook.react.module.annotations.ReactModule;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

@ReactModule(name = Pbkdf2Module.NAME)
public class Pbkdf2Module extends ReactContextBaseJavaModule {
  public static final String NAME = "Pbkdf2";

  public Pbkdf2Module(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  /**
   * PBKDF2 key derivation — returns hex string.
   *
   * @param password   Password string
   * @param salt       Salt string (UTF-8 encoded)
   * @param iterations Number of iterations (e.g. 100000)
   * @param keyLength  Desired key length in bytes (e.g. 32)
   * @param hashAlg    Hash algorithm: "sha256", "sha1", "sha512"
   * @param promise    React Native Promise
   */
  @ReactMethod
  public void derive(String password, String salt, int iterations, int keyLength, String hashAlg, Promise promise) {
    try {
      // Map JS hash names to Java algorithm names
      String algorithm;
      switch (hashAlg.toLowerCase()) {
        case "sha256":
          algorithm = "PBKDF2WithHmacSHA256";
          break;
        case "sha1":
          algorithm = "PBKDF2WithHmacSHA1";
          break;
        case "sha512":
          algorithm = "PBKDF2WithHmacSHA512";
          break;
        default:
          promise.reject("PBKDF2_ERROR", "Unsupported hash algorithm: " + hashAlg);
          return;
      }

      SecretKeyFactory factory = SecretKeyFactory.getInstance(algorithm);
      PBEKeySpec spec = new PBEKeySpec(
        password.toCharArray(),
        salt.getBytes("UTF-8"),
        iterations,
        keyLength * 8  // PBEKeySpec expects bits, not bytes
      );
      byte[] derived = factory.generateSecret(spec).getEncoded();

      // Convert to hex string
      StringBuilder sb = new StringBuilder(derived.length * 2);
      for (byte b : derived) {
        sb.append(String.format("%02x", b));
      }
      promise.resolve(sb.toString());
    } catch (Exception e) {
      promise.reject("PBKDF2_ERROR", "PBKDF2 derivation failed: " + e.getMessage(), e);
    }
  }
}

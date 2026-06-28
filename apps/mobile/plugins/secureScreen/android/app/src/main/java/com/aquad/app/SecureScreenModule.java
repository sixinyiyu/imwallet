package com.aquad.app;

import android.view.WindowManager;
import android.app.Activity;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

@ReactModule(name = SecureScreenModule.NAME)
public class SecureScreenModule extends com.facebook.react.bridge.ReactContextBaseJavaModule {
  public static final String NAME = "SecureScreen";

  public SecureScreenModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void enable() {
    Activity activity = getCurrentActivity();
    if (activity != null) {
      activity.runOnUiThread(() -> {
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
      });
    }
  }

  @ReactMethod
  public void disable() {
    Activity activity = getCurrentActivity();
    if (activity != null) {
      activity.runOnUiThread(() -> {
        activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
      });
    }
  }
}

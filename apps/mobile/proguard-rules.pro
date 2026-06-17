# AquaD ProGuard Rules

# Keep React Native components
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}

# Keep Hermes engine
-keep class com.facebook.hermes.** { *; }

# Keep Expo modules
-keep class expo.modules.** { *; }

# Keep native modules
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.bridge.BaseJavaModule { *; }

# Keep React views
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }
-keep class * extends com.facebook.react.uimanager.ViewGroupManager { *; }

# Keep React packages
-keep class * implements com.facebook.react.ReactPackage { *; }

# Keep JSEngine
-keep class com.facebook.react.bridge.JavaScriptExecutor { *; }

# Keep crypto (JSEncrypt/bcrypt)
-keep class org.bouncycastle.** { *; }
-dontwarn org.bouncycastle.**

# Keep OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Keep Retrofit (if used)
-dontwarn retrofit2.**

# General Android
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
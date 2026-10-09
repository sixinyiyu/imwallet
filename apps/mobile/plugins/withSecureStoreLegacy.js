const {
  withDangerousMod,
  withMainApplication,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo Config Plugin: SecureStoreLegacy
 *
 * Android: Injects SecureStoreLegacyModule + SecureStoreLegacyPackage into the generated
 *          native project, and registers the package in MainApplication.
 *
 * This module reads expo-secure-store v55 (old format) encrypted data using the legacy
 * KeyStore alias, bypassing v56's "decrypt-fail-then-delete" behavior.
 */
function withSecureStoreLegacy(config) {
  config = withAndroidSecureStoreLegacy(config);
  return config;
}

// ─── Android ───

function withAndroidSecureStoreLegacy(config) {
  // 1. Copy native module Java files into the generated android project
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const javaDir = path.join(
        projectRoot,
        "app/src/main/java/com/aquad/app"
      );

      // Ensure directory exists
      fs.mkdirSync(javaDir, { recursive: true });

      // Copy module files from plugin source
      const pluginDir = path.join(
        config.modRequest.projectRoot,
        "plugins/secureStoreLegacy/android/app/src/main/java/com/aquad/app"
      );

      const files = ["SecureStoreLegacyModule.java", "SecureStoreLegacyPackage.java"];
      for (const file of files) {
        const src = path.join(pluginDir, file);
        const dest = path.join(javaDir, file);
        fs.copyFileSync(src, dest);
      }

      return config;
    },
  ]);

  // 2. Register the package in MainApplication's packages.apply block
  config = withMainApplication(config, (config) => {
    const contents = config.modResults.contents;

    // Add import if not already present
    if (!contents.includes("import com.aquad.app.SecureStoreLegacyPackage")) {
      config.modResults.contents = contents.replace(
        /import android\.app\.Application/,
        "import com.aquad.app.SecureStoreLegacyPackage\nimport android.app.Application"
      );
    }

    // Add package to the packages.apply block
    // Insert after the last manually-added package (SecureScreenPackage)
    if (!contents.includes("SecureStoreLegacyPackage()")) {
      config.modResults.contents = config.modResults.contents.replace(
        /add\(SecureScreenPackage\(\)\)/,
        "add(SecureScreenPackage())\n          add(SecureStoreLegacyPackage())"
      );
    }

    return config;
  });

  return config;
}

module.exports = withSecureStoreLegacy;

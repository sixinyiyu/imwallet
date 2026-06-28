const {
  withDangerousMod,
  withMainApplication,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo Config Plugin: SecureScreen
 *
 * Android: Injects SecureScreenModule + SecureScreenPackage into the generated
 *          native project, and registers the package in MainApplication.
 *          The module provides enable()/disable() to toggle FLAG_SECURE.
 *
 * iOS: Injects SecureScreenModule.h/.m into the generated iOS project.
 *      The module detects screenshots via UIApplicationUserDidTakeScreenshotNotification
 *      and emits an "onScreenshot" event to JS. iOS cannot prevent screenshots
 *      at the system level — we only detect and warn.
 */
function withSecureScreen(config) {
  config = withAndroidSecureScreen(config);
  config = withIosSecureScreen(config);
  return config;
}

// ─── Android ───

function withAndroidSecureScreen(config) {
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
        "plugins/secureScreen/android/app/src/main/java/com/aquad/app"
      );

      const files = ["SecureScreenModule.java", "SecureScreenPackage.java"];
      for (const file of files) {
        const src = path.join(pluginDir, file);
        const dest = path.join(javaDir, file);
        fs.copyFileSync(src, dest);
      }

      return config;
    },
  ]);

  // 2. Register the package in MainApplication's getPackages()
  config = withMainApplication(config, (config) => {
    const contents = config.modResults.contents;

    // Add import if not already present (Kotlin: no semicolons)
    if (!contents.includes("import com.aquad.app.SecureScreenPackage")) {
      config.modResults.contents = contents.replace(
        /import android\.app\.Application/,
        "import com.aquad.app.SecureScreenPackage\nimport android.app.Application"
      );
    }

    // Add package to the packages.apply block
    if (!contents.includes("SecureScreenPackage()")) {
      config.modResults.contents = config.modResults.contents.replace(
        /\.apply \{\n(\s*)\/\/ Packages/,
        ".apply {\n$1add(SecureScreenPackage())\n$1// Packages"
      );
    }

    return config;
  });

  return config;
}

// ─── iOS ───

function withIosSecureScreen(config) {
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;

      // Find the .xcodeproj directory
      const xcodeprojDir = fs
        .readdirSync(projectRoot)
        .find((f) => f.endsWith(".xcodeproj"));
      if (!xcodeprojDir) {
        throw new Error("Could not find .xcodeproj in iOS project root");
      }

      const projPath = path.join(projectRoot, xcodeprojDir, "project.pbxproj");
      let pbxContents = fs.readFileSync(projPath, "utf-8");

      // Copy module files from plugin source
      const pluginDir = path.join(
        config.modRequest.projectRoot,
        "plugins/secureScreen/ios"
      );

      const moduleFiles = ["SecureScreenModule.h", "SecureScreenModule.m"];

      // Copy files to the iOS project root (they'll be alongside other source files)
      for (const file of moduleFiles) {
        const src = path.join(pluginDir, file);
        const dest = path.join(projectRoot, file);
        fs.copyFileSync(src, dest);
      }

      // Add files to the Xcode project's PBXBuildFile and PBXFileReference sections
      // This is a simplified approach — we add the .m file as a source and .h as a header
      for (const file of moduleFiles) {
        const fileRefUuid = generateUuid();
        const buildFileUuid = generateUuid();

        // Add to PBXFileReference
        const pbxFileRefSection = pbxContents.indexOf("/* Begin PBXFileReference section */");
        const pbxFileRefEnd = pbxContents.indexOf("/* End PBXFileReference section */");
        if (pbxFileRefSection !== -1 && pbxFileRefEnd !== -1) {
          const isSource = file.endsWith(".m");
          const fileType = isSource ? "sourcecode.c.objc" : "sourcecode.c.h";
          const fileRefLine = `\t\t${fileRefUuid} /* ${file} */ = {isa = PBXFileReference; fileEncoding = 4; lastKnownFileType = ${fileType}; name = ${file}; path = ${file}; sourceTree = "<group>"; };\n`;
          pbxContents =
            pbxContents.slice(0, pbxFileRefEnd) +
            fileRefLine +
            pbxContents.slice(pbxFileRefEnd);
        }

        // Add to PBXBuildFile (only .m files need this)
        if (file.endsWith(".m")) {
          const pbxBuildFileSection = pbxContents.indexOf("/* Begin PBXBuildFile section */");
          const pbxBuildFileEnd = pbxContents.indexOf("/* End PBXBuildFile section */");
          if (pbxBuildFileSection !== -1 && pbxBuildFileEnd !== -1) {
            const buildFileLine = `\t\t${buildFileUuid} /* ${file} in Sources */ = {isa = PBXBuildFile; fileRef = ${fileRefUuid} /* ${file} */; };\n`;
            pbxContents =
              pbxContents.slice(0, pbxBuildFileEnd) +
              buildFileLine +
              pbxContents.slice(pbxBuildFileEnd);
          }

          // Add to PBXSourcesBuildPhase
          const sourcesBuildPhaseMatch = pbxContents.match(
            /\/\* Begin PBXSourcesBuildPhase section \*\/.*?files = \(\n([\s\S]*?)\n\t\t\);/
          );
          if (sourcesBuildPhaseMatch) {
            const insertPos = pbxContents.indexOf(sourcesBuildPhaseMatch[0]) + sourcesBuildPhaseMatch[0].lastIndexOf("\t\t);");
            const sourceLine = `\t\t\t\t${buildFileUuid} /* ${file} in Sources */,`;
            pbxContents =
              pbxContents.slice(0, insertPos) +
              sourceLine + "\n" +
              pbxContents.slice(insertPos);
          }
        }

        // Add to the main group's children
        const mainGroupMatch = pbxContents.match(
          /\/\* MainGroup \*\/.*?children = \(\n([\s\S]*?)\n\t\t\);/
        );
        if (mainGroupMatch) {
          const insertPos = pbxContents.indexOf(mainGroupMatch[0]) + mainGroupMatch[0].lastIndexOf("\t\t);");
          const childLine = `\t\t\t\t${fileRefUuid} /* ${file} */,`;
          pbxContents =
            pbxContents.slice(0, insertPos) +
            childLine + "\n" +
            pbxContents.slice(insertPos);
        }
      }

      fs.writeFileSync(projPath, pbxContents);
      return config;
    },
  ]);

  return config;
}

/**
 * Generate a simple 24-char hex UUID for Xcode project entries
 */
function generateUuid() {
  const chars = "0123456789ABCDEF";
  let uuid = "";
  for (let i = 0; i < 24; i++) {
    uuid += chars[Math.floor(Math.random() * chars.length)];
  }
  return uuid;
}

module.exports = withSecureScreen;
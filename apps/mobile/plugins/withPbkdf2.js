const {
  withDangerousMod,
  withMainApplication,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo Config Plugin: Pbkdf2
 *
 * Injects a lightweight native PBKDF2 module into the generated Android/iOS
 * projects. Uses system crypto APIs (javax.crypto on Android, CommonCrypto on
 * iOS) — zero extra native dependencies, ~0.3-0.5MB compiled size.
 *
 * Replaces react-native-quick-crypto (which adds ~12MB of OpenSSL + simdutf).
 */
function withPbkdf2(config) {
  config = withAndroidPbkdf2(config);
  config = withIosPbkdf2(config);
  return config;
}

// ─── Android ───

function withAndroidPbkdf2(config) {
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
        "plugins/pbkdf2/android/app/src/main/java/com/aquad/app"
      );

      const files = ["Pbkdf2Module.java", "Pbkdf2Package.java"];
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

    // Add import if not already present
    if (!contents.includes("import com.aquad.app.Pbkdf2Package")) {
      config.modResults.contents = contents.replace(
        /import android\.app\.Application/,
        "import com.aquad.app.Pbkdf2Package\nimport android.app.Application"
      );
    }

    // Add package to the packages.apply block
    if (!contents.includes("Pbkdf2Package()")) {
      config.modResults.contents = config.modResults.contents.replace(
        /\.apply \{\n(\s*)\/\/ Packages/,
        ".apply {\n$1add(Pbkdf2Package())\n$1// Packages"
      );
    }

    return config;
  });

  return config;
}

// ─── iOS ───

function withIosPbkdf2(config) {
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
        "plugins/pbkdf2/ios"
      );

      const moduleFiles = ["Pbkdf2Module.h", "Pbkdf2Module.m"];

      // Copy files to the iOS project root
      for (const file of moduleFiles) {
        const src = path.join(pluginDir, file);
        const dest = path.join(projectRoot, file);
        fs.copyFileSync(src, dest);
      }

      // Add files to the Xcode project
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

module.exports = withPbkdf2;
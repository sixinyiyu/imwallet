const { withAppBuildGradle, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Config plugin that:
 * 1. Reads BUILD_ABI env var and sets reactNativeArchitectures + ndk.abiFilters
 * 2. Enables minification (R8) and resource shrinking for release builds
 * 3. Reads API_BASE_URL env var and injects into app.json extra.apiBaseUrl
 * 4. Reads EAS_PROJECT_ID env var and injects into app.json extra.eas.projectId
 */
function withAbiFilter(config) {
  const abi = process.env.BUILD_ABI;
  const apiBaseUrl = process.env.API_BASE_URL;
  const easProjectId = process.env.EAS_PROJECT_ID;

  // 0. Inject env vars into app config extra
  if (config.extra) {
    if (apiBaseUrl) {
      config.extra.apiBaseUrl = apiBaseUrl;
    }
    if (easProjectId && config.extra.eas) {
      config.extra.eas.projectId = easProjectId;
    }
  }

  // 1. Modify gradle.properties via withDangerousMod
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const gradlePropsPath = path.join(
        config.modRequest.platformProjectRoot,
        "gradle.properties"
      );
      if (fs.existsSync(gradlePropsPath)) {
        let content = fs.readFileSync(gradlePropsPath, "utf-8");

        // Enable minify and shrink resources
        content = setGradleProp(
          content,
          "android.enableMinifyInReleaseBuilds",
          "true"
        );
        content = setGradleProp(
          content,
          "android.enableShrinkResourcesInReleaseBuilds",
          "true"
        );

        // Set specific architecture
        if (abi) {
          content = setGradleProp(
            content,
            "reactNativeArchitectures",
            abi
          );
        }

        fs.writeFileSync(gradlePropsPath, content);
      }
      return config;
    },
  ]);

  // 2. Add abiFilters to build.gradle release block
  config = withAppBuildGradle(config, (config) => {
    if (abi && !config.modResults.contents.includes("abiFilters")) {
      config.modResults.contents = config.modResults.contents.replace(
        /(\s+release\s*\{)/,
        `$1\n            ndk {\n                abiFilters '${abi}'\n            }`
      );
    }
    return config;
  });

  return config;
}

/**
 * Set or add a property in gradle.properties content
 */
function setGradleProp(content, key, value) {
  const regex = new RegExp(`^${key.replace(/\./g, "\\.")}.*$`, "m");
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  }
  return content + `\n${key}=${value}`;
}

module.exports = withAbiFilter;

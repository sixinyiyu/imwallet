const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Config plugin that:
 * 1. Reads BUILD_ABI env var and adds ndk.abiFilters for architecture-specific APKs
 * 2. Enables minification (R8) and resource shrinking for release builds
 */
function withAbiFilter(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

    // Add abiFilters if BUILD_ABI is set
    const abi = process.env.BUILD_ABI;
    if (abi && !contents.includes("abiFilters")) {
      config.modResults.contents = config.modResults.contents.replace(
        /buildTypes\s*\{\s*release\s*\{/,
        `buildTypes {\n        release {\n            ndk {\n                abiFilters '${abi}'\n            }`
      );
    }

    // Enable minification and resource shrinking for release builds
    const gradle = config.modResults.contents;
    if (!gradle.includes("minifyEnabled")) {
      config.modResults.contents = config.modResults.contents.replace(
        /buildTypes\s*\{\s*release\s*\{/,
        `buildTypes {\n        release {\n            minifyEnabled true\n            shrinkResources true\n            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'`
      );
    }

    return config;
  });
}

module.exports = withAbiFilter;

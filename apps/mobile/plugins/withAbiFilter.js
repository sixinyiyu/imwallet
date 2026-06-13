const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Config plugin that reads BUILD_ABI env var and adds ndk.abiFilters
 * to the release build type, producing architecture-specific APKs.
 */
function withAbiFilter(config) {
  const abi = process.env.BUILD_ABI;
  if (!abi) return config;

  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes("abiFilters")) return config;

    config.modResults.contents = config.modResults.contents.replace(
      /buildTypes\s*\{\s*release\s*\{/,
      `buildTypes {\n        release {\n            ndk {\n                abiFilters '${abi}'\n            }`
    );
    return config;
  });
}

module.exports = withAbiFilter;

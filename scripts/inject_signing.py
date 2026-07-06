#!/usr/bin/env python3
"""Inject release signing config into Expo-generated app/build.gradle."""
import re
import sys

with open('app/build.gradle', 'r') as f:
    gradle = f.read()

# Add keystore properties loader at the top of the file
props_header = """def keystoreProperties = new Properties()
keystoreProperties.load(new FileInputStream(rootProject.file("keystore.properties")))

"""
gradle = props_header + gradle

# Replace the entire signingConfigs block with debug + release configs
new_signing_configs = """    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }"""

# Match the entire signingConfigs block using DOTALL flag
gradle = re.sub(
    r'signingConfigs\s*\{.*?\n\s*\}',
    new_signing_configs,
    gradle,
    flags=re.DOTALL
)
print("✅ signingConfigs block replaced with debug + release")

# Change ONLY the release buildType's signingConfig from debug to release
# Must NOT change the debug buildType's signingConfig
target = "signingConfig signingConfigs.debug"
first_idx = gradle.find(target)
second_idx = gradle.find(target, first_idx + len(target))
if second_idx != -1:
    gradle = gradle[:second_idx] + "signingConfig signingConfigs.release" + gradle[second_idx + len(target):]
    print("✅ release buildType signingConfig updated")
else:
    # If only one occurrence exists, replace it (it must be in the release block)
    gradle = gradle.replace(target, "signingConfig signingConfigs.release")
    print("✅ single signingConfig occurrence updated")

with open('app/build.gradle', 'w') as f:
    f.write(gradle)

print("✅ Signing config injected into build.gradle")

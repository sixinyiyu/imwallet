#!/usr/bin/env python3
"""Inject release signing config into Expo-generated app/build.gradle."""
import re

with open('app/build.gradle', 'r') as f:
    gradle = f.read()

# Add keystore properties loader at the top of the file
props_header = """def keystoreProperties = new Properties()
keystoreProperties.load(new FileInputStream(rootProject.file("keystore.properties")))

"""
gradle = props_header + gradle

# Replace the entire signingConfigs block with debug + release configs
# We need to match the full block including nested braces (debug { ... })
# Strategy: find "signingConfigs {" then count brace depth to find the matching close
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

# Find the start of signingConfigs block
start_marker = "signingConfigs {"
start_idx = gradle.find(start_marker)
if start_idx == -1:
    print("❌ Could not find 'signingConfigs {' in build.gradle")
    exit(1)

# Count braces to find the matching closing brace
depth = 0
i = start_idx + len(start_marker)
while i < len(gradle):
    if gradle[i] == '{':
        depth += 1
    elif gradle[i] == '}':
        if depth == 0:
            # This is the closing brace of the signingConfigs block
            end_idx = i + 1
            break
        depth -= 1
    i += 1

if i >= len(gradle):
    print("❌ Could not find closing brace for signingConfigs block")
    exit(1)

# Replace the old block with the new one
gradle = gradle[:start_idx] + new_signing_configs + gradle[end_idx:]
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

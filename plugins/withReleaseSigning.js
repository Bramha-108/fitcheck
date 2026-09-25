const { withAppBuildGradle } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function readKeystoreProperties(projectRoot) {
  const file = path.join(projectRoot, 'keystore.properties');
  if (!fs.existsSync(file)) return null;
  const props = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    props[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return props;
}

// Wires a local, self-signed release keystore (keystore.properties + keystore/release.jks,
// both gitignored) into the generated android/app/build.gradle so `gradlew assembleRelease`
// produces a signed, sideloadable APK without EAS or any cloud signing service.
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    const props = readKeystoreProperties(config.modRequest.projectRoot);
    if (!props) {
      console.warn(
        '[withReleaseSigning] keystore.properties not found at project root — release build will fall back to debug signing.'
      );
      return config;
    }

    let contents = config.modResults.contents;

    const signingConfigBlock = `
    signingConfigs {
        release {
            storeFile file("${props.storeFile}")
            storePassword "${props.storePassword}"
            keyAlias "${props.keyAlias}"
            keyPassword "${props.keyPassword}"
        }
    }
`;
    contents = contents.replace(/(android\s*\{)/, `$1\n${signingConfigBlock}`);

    // Appended after the whole android {} block so it doesn't need to pattern-match
    // the internal structure of the generated buildTypes.release block.
    contents += `\nandroid.buildTypes.release.signingConfig = android.signingConfigs.release\n`;

    config.modResults.contents = contents;
    return config;
  });
};

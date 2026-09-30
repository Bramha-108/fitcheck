const { withAndroidManifest } = require('expo/config-plugins');

// FitCheck only touches its own app-scoped storage (see spec.md / CHECKLIST.md #28), so
// none of these template/library-default permissions apply. Strips Expo's generic
// bare-template extras and blocks anything a library (e.g. expo-file-system's own
// AndroidManifest.xml) would otherwise merge back in.
//
// INTERNET is deliberately *not* stripped: it's needed for the app-update check
// (src/utils/updateCheck.ts) — one GET to GitHub Releases, only when the user taps
// "Check for updates" or opts into the daily check. Nothing else uses the network.
const REMOVE_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.VIBRATE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  // Merged in by expo-application for getInstallReferrerAsync() (Play Store install
  // attribution), which FitCheck never calls — it's only used for the app's version.
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
];

module.exports = function withMinimalPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-permission'] = (manifest['uses-permission'] || []).filter(
      (perm) => !REMOVE_PERMISSIONS.includes(perm.$['android:name'])
    );
    for (const name of REMOVE_PERMISSIONS) {
      manifest['uses-permission'].push({
        $: { 'android:name': name, 'tools:node': 'remove' },
      });
    }
    return config;
  });
};

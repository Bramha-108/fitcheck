const { withAndroidManifest } = require('expo/config-plugins');

// FitCheck is fully offline and only touches its own app-scoped storage (see spec.md /
// CHECKLIST.md #28), so none of these template/library-default permissions apply. Strips
// Expo's generic bare-template extras and blocks anything a library (e.g. expo-file-system's
// own AndroidManifest.xml) would otherwise merge back in.
const REMOVE_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.VIBRATE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
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

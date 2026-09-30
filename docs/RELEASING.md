# Releasing FitCheck (Android APK)

How a release APK is built, verified and published, written down so nobody has
to reconstruct it next time. FitCheck ships as a sideloaded APK on GitHub
Releases, with no Play Store and no EAS/cloud build. The in-app update check
(`src/utils/updateCheck.ts`) reads those same releases, so the steps below are
also what makes an update show up for users.

> **Never commit or paste the keystore passwords anywhere,** including this
> file, issues, commit messages or chat logs. They live only in
> `keystore.properties` on the build machine (gitignored).

## What you need (build machine: Windows, as of 1.1.0)

| Thing | Where | Notes |
|---|---|---|
| Release keystore | `keystore/release.jks` (repo root) | Gitignored (`/keystore/`, `*.jks`). Key alias `fitcheck-release`. |
| Keystore config | `keystore.properties` (repo root) | Gitignored. Keys: `storeFile` (absolute path to the `.jks`), `storePassword`, `keyAlias`, `keyPassword`. |
| Android SDK | `C:/Users/Saksham/AppData/Local/Android/Sdk` | Referenced by `android/local.properties` (`sdk.dir=…`). Needs build-tools (`apksigner`, `aapt2`); 37.0.0 is installed. |
| JDK for Gradle | `C:\Program Files\Android\Android Studio\jbr` | Android Studio's bundled JDK. The system `java` (25) is too new for Gradle, so set `JAVA_HOME` to the JBR for the build. |
| Node deps | `npm install` | |

**Signing identity.** Every release must be signed with this certificate:

- Subject: `CN=FitCheck, OU=Personal, O=FitCheck, L=Unknown, ST=Unknown, C=US`
- Certificate SHA-256: `b173c26bdd22a1c4be6af04db6a082c2791b411bbc5d9852d1ea1e3a85dab4a1`

Android only installs an update over the existing app if it's signed with the
same key. A differently signed APK forces users to uninstall first, which
deletes their whole closet (it lives only on the device). So:

- **Back up `keystore/release.jks` and both passwords somewhere offline**
  (password manager plus an off-machine copy). If they're lost, no future
  release can ever update an existing install.
- If `keystore.properties` is missing, `plugins/withReleaseSigning.js` only
  prints a warning and **falls back to debug signing**. The build still
  "succeeds". Always run the signature check in step 5 before publishing.

## Steps

Commands are for Git Bash on Windows, run from the repo root unless noted.

On the maintainer's machine, a local Claude Code skill automates steps 3–6:
`.claude/skills/release-apk/build-apk.sh` (gitignored, so it isn't in the repo).
It refuses to produce `dist/` output unless the signature, version and
permissions all check out. The manual steps below are the same process.

1. **Bump the version** in `app.json`: `expo.version` (e.g. `1.2.0`) and
   `expo.android.versionCode` (+1, always an integer higher than the last
   release). Commit it (`Release X.Y.Z (versionCode N)`).

2. **Test:**
   ```bash
   npx jest && npx tsc --noEmit
   ```

3. **Regenerate the native project.** `android/` is generated and gitignored,
   so always regenerate it. Config plugins (permissions, signing) and new
   native modules only take effect this way. `--clean` deletes
   `android/local.properties`, so back it up and restore it (or set
   `ANDROID_HOME` instead):
   ```bash
   cp android/local.properties /tmp/local.properties
   CI=1 npx expo prebuild -p android --clean
   cp /tmp/local.properties android/local.properties
   ```
   The `userInterfaceStyle: Install expo-system-ui…` warning is expected and harmless.

4. **Build** (takes ~5–15 min; many Kotlin deprecation warnings are normal):
   ```bash
   cd android
   JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew assembleRelease
   # -> android/app/build/outputs/apk/release/app-release.apk
   ```
   ABIs (`arm64-v8a`, `armeabi-v7a`), R8 minify and resource shrinking come
   from `expo-build-properties` in `app.json`.

5. **Verify the APK before publishing.** Copy it out under its release name,
   then check the signer and the version:
   ```bash
   cp android/app/build/outputs/apk/release/app-release.apk dist/fitcheck-X.Y.Z.apk   # mkdir -p dist first
   BT=/c/Users/Saksham/AppData/Local/Android/Sdk/build-tools/37.0.0
   JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" "$BT/apksigner.bat" verify --print-certs dist/fitcheck-X.Y.Z.apk
   "$BT/aapt2.exe" dump badging dist/fitcheck-X.Y.Z.apk | grep -E "^package|uses-permission"
   ```
   - Certificate SHA-256 must equal `b173c26b…dab4a1` (full value above).
     Anything else, including `CN=Android Debug`, means **stop**.
   - `versionName`/`versionCode` must match `app.json`.
   - Permissions should be only `INTERNET` (update check, since 1.1.0) plus
     Android's own `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. Anything new
     means a library merged one in. Strip it in `plugins/withMinimalPermissions.js`.
     (1.1.0 example: `expo-application` brought in Google Play's
     `BIND_GET_INSTALL_REFERRER_SERVICE`, now stripped.)
   - Ideally install it over the previous release on a real phone and check
     the closet survives.

6. **Checksum,** in the same format as 1.0.0 (`<hash> *<file>`):
   ```bash
   (cd dist && sha256sum -b fitcheck-X.Y.Z.apk > fitcheck-X.Y.Z.apk.sha256)
   ```

7. **Merge to `main`, tag, push:**
   ```bash
   git checkout main && git merge --ff-only <release-branch>
   git tag vX.Y.Z && git push origin main vX.Y.Z
   ```
   The tag must be `v` + `expo.version` exactly. The in-app update check
   compares the tag with the installed version, and a tag that isn't a higher
   version number is never offered.

8. **Publish the GitHub release** with both files:
   ```bash
   gh release create vX.Y.Z dist/fitcheck-X.Y.Z.apk dist/fitcheck-X.Y.Z.apk.sha256 \
     --title "FitCheck X.Y.Z" --target main --notes "…what changed…

   Signed universal APK for arm64-v8a and armeabi-v7a devices (Android sideload).

   Verify the download with the attached .sha256 file:
   \`sha256sum -c fitcheck-X.Y.Z.apk.sha256\`"
   ```
   This mirrors how 1.0.0 was published: title `FitCheck 1.0.0`, tag `v1.0.0`
   on `main`, and exactly two assets, the APK and its `.sha256`. GitHub adds
   the source-code zip/tar.gz itself.
   Once it's published, installs from 1.1.0 onward will see "Version X.Y.Z is
   available" in Profile after their next check. The file name doesn't matter
   to the app (it picks the release's `.apk` asset), but keep the
   `fitcheck-X.Y.Z.apk` convention.

## Release history

| Version | versionCode | Commit (tag) | Date | Notes |
|---|---|---|---|---|
| 1.0.0 | 1 | `028d87d` (`v1.0.0`) | 2026-09-29 | First release. No update checker; users must install 1.1.0 manually once. |
| 1.1.0 | 2 | see `v1.1.0` | 2026-10-01 | Adds the in-app update check (re-enables INTERNET), Outseam, and navigation/keyboard/photo/sheet fixes. |

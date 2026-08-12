# castor_mobile

Flutter mobile app for Castor (iOS/Android), mirroring `webapp`'s pages.
Google login (Firebase Auth, same account system as `webapp`) gates the
whole app -- see "5. Firebase / Google Sign-In setup" below, required
before the app will run. Beyond sign-in itself, no other backend calls are
wired up yet -- every tab is still a static placeholder.

## What's here

```
mobile/
  lib/
    main.dart              # MaterialApp entry point + Firebase init + auth gate
    config.dart             # API base URL
    theme/app_theme.dart   # colors ported from webapp/app/globals.css
    services/
      auth_service.dart      # Google Sign-In + Firebase Auth wrapper
      api_client.dart        # HTTP client, mirrors webapp/lib/api.ts's auth header convention
    widgets/
      root_shell.dart          # bottom NavigationBar + IndexedStack across tabs
      coming_soon_notice.dart  # shared "not wired up yet" placeholder card
    pages/
      login_page.dart     # Google sign-in screen, shown when signed out
      adaptive_page.dart  # mirrors webapp/app/adaptive (智慧練習) -- also the home tab
      reply_tabs_page.dart # mirrors webapp/app/reply + /wrong (作答記錄, 2 inner tabs)
      analysis_page.dart  # mirrors webapp/app/analysis (學習分析)
      box_page.dart       # mirrors webapp/app/box (禮物盒)
      user_page.dart      # mirrors webapp/app/user (個人資料, incl. sign-out)
  test/widget_test.dart
  android/               # generated via `flutter create`, standard Gradle project
  ios/                   # generated via `flutter create`, standard Xcode project
  pubspec.yaml
```

`android/` and `ios/` were generated with `flutter create --platforms=android,ios .`
(Flutter 3.44.8) rather than hand-written, so they're guaranteed-correct,
unmodified native project files. `flutter pub get` and `flutter analyze`
both run clean, and `flutter test` passes -- see "Verified so far" below.
If you're on a different Flutter version and it complains about the
Gradle/Xcode project, regenerating with your own `flutter create
--platforms=android,ios .` is safe -- it won't touch `lib/` or `pubspec.yaml`.

**These folders are committed, not gitignored**, even though they were
generated. `flutter create` is a one-time scaffold, not a build step --
unlike `.dart_tool/`/`build/` (which are 100% derivable and gitignored),
`android/`/`ios/` immediately become real hand-maintained project files
the moment you add a plugin with native code, a permission, an app icon,
or signing config. There's no command that regenerates those customizations
from scratch, so whoever clones this repo needs the actual files, not a
blank template. (`android/.gitignore` and `ios/.gitignore`, both also
generated, already exclude the genuinely-derivable bits inside them --
`local.properties`, the Gradle wrapper jar, `Pods/`, `DerivedData/`.)

## Verified so far (this repo, Flutter 3.44.8, Android SDK 36 + emulator)

- `flutter pub get` -- resolves cleanly
- `flutter analyze` -- **no issues found**
- `flutter test` -- **all tests passed** (`test/widget_test.dart`)
- `flutter build apk --debug` -- **fails with a clear error** until
  `android/app/google-services.json` exists (see "5. Firebase / Google
  Sign-In setup"); confirmed it fails at exactly that point and nothing
  else, with the config file missing.
- Not yet re-verified end-to-end on a real emulator since the login gate
  was added -- that needs a real `google-services.json` (step 5 below)
  first. Before the login gate, this was confirmed working (opened
  directly into 智慧練習, bottom nav switching worked); the underlying
  `RootShell` behavior itself is unchanged and still covered by
  `test/widget_test.dart`, just no longer the thing shown at cold launch.

## 1. Install Flutter

Already done in this repo's dev environment (via Scoop). For a fresh
machine, pick one:

- Download the SDK directly: https://docs.flutter.dev/get-started/install
- Windows via Chocolatey: `choco install flutter`
- Windows via Scoop: `scoop bucket add extras; scoop install flutter`
- macOS via Homebrew: `brew install --cask flutter`

After installing, open a **new** terminal and confirm:

```sh
flutter --version
```

## 2. Fetch dependencies

```sh
cd mobile
flutter pub get
```

(`android/` and `ios/` already exist -- only re-run `flutter create
--platforms=android,ios .` if you need to regenerate them for your own
Flutter version.)

## 3. Check your toolchain

```sh
flutter doctor
```

Fix anything marked with a red `[✗]`:

- **Android**: install [Android Studio](https://developer.android.com/studio),
  then run it once so it downloads the Android SDK. Then:
  ```sh
  flutter doctor --android-licenses   # accept all
  ```
- **iOS**: only buildable on macOS with Xcode installed
  (`xcode-select --install`, then open Xcode once to accept its license).
  There is no iOS simulator on Windows/Linux -- if you're on Windows, you
  can still develop and test everything on Android; iOS testing needs a Mac.

## 4. Run it

List available targets:

```sh
flutter devices
```

**Android emulator** -- open Android Studio → More Actions → Virtual Device
Manager → create a device (e.g. Pixel 8, latest API) → click ▶ to boot it,
then:

```sh
flutter run
```

**Physical Android phone** -- enable Developer Options (tap Build Number 7
times in Settings → About Phone) → enable USB Debugging → connect via USB
→ accept the "allow USB debugging" prompt on the phone → `flutter run`.

**iOS Simulator (Mac only)**:

```sh
open -a Simulator
flutter run
```

**Physical iPhone (Mac only)** -- connect via USB, trust the computer on the
phone, select your Apple ID for code signing in `ios/Runner.xcworkspace`
(opened via Xcode) the first time, then `flutter run`.

If more than one device/emulator is available, target one explicitly:

```sh
flutter run -d <deviceId>   # deviceId from `flutter devices`
```

While it's running: press `r` for hot reload, `R` for hot restart, `q` to
quit.

## 5. Firebase / Google Sign-In setup

The app won't build/run without this -- `Firebase.initializeApp()` in
`main.dart` throws at startup if these native config files are missing.
Both native app identifiers already exist in this repo (`android/app/build.gradle.kts`'s
`applicationId`, `ios/Runner.xcodeproj`'s `PRODUCT_BUNDLE_IDENTIFIER`); they
just need to be registered as apps under the **same Firebase project**
`webapp` uses (see `webapp/lib/firebase.ts`'s `NEXT_PUBLIC_FIREBASE_PROJECT_ID`).

1. Install the [Firebase CLI](https://firebase.google.com/docs/cli) and the
   [FlutterFire CLI](https://firebase.google.com/docs/flutter/setup) if you
   don't have them: `dart pub global activate flutterfire_cli`.
2. From `mobile/`, run `flutterfire configure` and select the existing web
   project. This registers the Android/iOS app IDs above (if not already
   registered) and downloads:
   - `android/app/google-services.json`
   - `ios/Runner/GoogleService-Info.plist`

   Neither file is committed (see `.gitignore`) since they contain
   per-environment API keys -- every developer running this app needs their
   own copy from Firebase console access, same as `webapp/.env`.
3. **iOS only**: open `GoogleService-Info.plist`, copy its `REVERSED_CLIENT_ID`
   value, and add it as a URL scheme in `ios/Runner/Info.plist`:
   ```xml
   <key>CFBundleURLTypes</key>
   <array>
     <dict>
       <key>CFBundleURLSchemes</key>
       <array>
         <string>PASTE_REVERSED_CLIENT_ID_HERE</string>
       </array>
     </dict>
   </array>
   ```
   Required for `google_sign_in`'s OAuth redirect back into the app; without
   it, the Google account picker opens but never returns control to Castor.
4. **CI only**: `.github/workflows/mobile.yml`'s `build-android`/`build-ios`
   jobs materialize both files from repo secrets (`GOOGLE_SERVICES_JSON`,
   `GOOGLE_SERVICE_INFO_PLIST`) before building -- add those secrets (base64
   of each file's contents) under the repo's Actions settings, mirroring how
   `dev.yml` already writes `webapp/.env` from `NEXT_PUBLIC_FIREBASE_*`
   secrets.

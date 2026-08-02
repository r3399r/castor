# castor_mobile

Flutter mobile app for Castor (iOS/Android), mirroring `webapp`'s pages.
No backend calls are wired up yet -- every tab is a static placeholder.

## What's here

```
mobile/
  lib/
    main.dart              # MaterialApp entry point
    theme/app_theme.dart   # colors ported from webapp/app/globals.css
    widgets/
      root_shell.dart          # bottom NavigationBar + IndexedStack across tabs
      coming_soon_notice.dart  # shared "not wired up yet" placeholder card
    pages/
      adaptive_page.dart  # mirrors webapp/app/adaptive (智慧練習) -- also the home tab
      reply_page.dart     # mirrors webapp/app/reply (作答記錄)
      wrong_page.dart     # mirrors webapp/app/wrong (錯題本)
      user_page.dart      # mirrors webapp/app/user (學習分析)
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
- `flutter build apk --debug` -- **builds successfully**
- Installed on a real Android emulator and launched -- renders correctly,
  opens directly into 智慧練習, and tapping bottom nav destinations
  switches pages as expected.

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

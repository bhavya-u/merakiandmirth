# Meraki & Mirth Workspace

The private workspace for managing products, combos, client catalogues, quotes, and orders. Business data is stored in Supabase; product images are served from the catalogue image paths stored with each product.

## Isolated local development

For testing without production access, follow [Local development](docs/local-development.md). Run `npm run local:serve` after starting and seeding local Supabase. This serves local configuration and blocks production connections.

## Run the web app

```bash
npm start
```

Open [http://localhost:4173](http://localhost:4173) and sign in with an approved staff email and password.

## Android app

The Android app uses Capacitor and packages the same web app with the same Supabase workspace. Its Android application ID is `com.merakiandmirth.workspace` and it requires Android 7.0 (API 24) or later.

### Build a staff-testing APK

```bash
npm run android:sync
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
ANDROID_SDK_ROOT=/opt/homebrew/share/android-commandlinetools \
./gradlew assembleDebug
```

The APK is written to:

`android/app/build/outputs/apk/debug/app-debug.apk`

It is debug-signed and intended only for internal testing. Install it on a connected Android phone with:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

For the complete USB and manual-install steps, see [Android installation guide](docs/android-installation.md).

Enable **Install unknown apps** for the chosen installer if Android asks. A Play Store release needs a separate, securely stored release signing key and an Android App Bundle (`.aab`).

### Updating the app

1. Change the web app, Supabase schema, or catalogue assets.
2. Run `npm run android:sync`.
3. Rebuild the debug APK with the command above.
4. Install it over the previous testing version with `adb install -r ...`.

### Catalogue image optimisation

The original PNGs remain in `assets/catalogue/`. `npm run images:mobile` creates compressed WebP copies in `assets/catalogue-webp/`, and the Android bundle includes only the WebP copies. Install the `webp` command-line tool (`brew install webp`) before adding new source PNGs on a new development machine.

## Supabase

Apply the migrations in `supabase/migrations/` to the production project. Keep only the public Supabase URL and anon/publishable key in `supabase-config.js`; never put a service-role key in the browser app.

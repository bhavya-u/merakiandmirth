# Installing the Meraki & Mirth Android test app

The internal-test APK is built at:

`android/app/build/outputs/apk/debug/app-debug.apk`

This APK is debug-signed and intended for the Meraki & Mirth team only. Use the USB method first; it is the quickest and does not require transferring the file to the phone.

## Option A — install by USB (recommended)

1. On the Android phone, open **Settings → About phone**.
2. Tap **Build number** seven times. Enter the phone PIN if prompted. Android will confirm that developer mode is enabled.
3. Go back to **Settings → System → Developer options**. On some phones this is under **Settings → Additional settings → Developer options**.
4. Turn on **USB debugging**.
5. Connect the phone to the Mac with a data-capable USB cable.
6. Unlock the phone. When prompted, choose **Allow USB debugging**. You may also select **Always allow from this computer**.
7. Open Terminal and enter the project folder:

   ```bash
   cd /Users/nrkvi/Bs_Workspace/repos/merakiandmirth
   ```

8. Confirm that the phone is detected:

   ```bash
   /opt/homebrew/share/android-commandlinetools/platform-tools/adb devices
   ```

   A connected phone appears with `device` at the end, for example:

   ```text
   R5CT...    device
   ```

   If it says `unauthorized`, unlock the phone and accept the USB-debugging prompt. If no device appears, try another cable or USB port, then run the command again.

9. Install the APK:

   ```bash
   /opt/homebrew/share/android-commandlinetools/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

   The `-r` option replaces an earlier installation while retaining the app's local data.

10. Wait for `Success` in Terminal.
11. On the phone, open **Meraki & Mirth**, sign in with an approved staff account, and test Products, Catalogues, Quotes, and Orders.

To install a newer APK later, repeat steps 7–10.

## Option B — install from the phone manually

Use this if USB debugging is not convenient.

1. Copy `app-debug.apk` to Google Drive, WhatsApp to yourself, email, or another file-transfer method.
2. On the phone, download or open the file through the receiving app.
3. Android may show: **“For your security, this source is not allowed to install unknown apps.”**
4. Tap **Settings**, then enable **Allow from this source** for the current app—for example Chrome, Files, Gmail, or Drive.
5. Return to the APK and tap **Install**.
6. Open **Meraki & Mirth** from the app drawer.

The “unknown apps” permission is needed only for this manual method. It is normally not needed for USB/ADB installation.

## Troubleshooting

- **`adb: command not found`**: use the complete command path shown above.
- **Phone is not listed by `adb devices`**: unlock the phone, select the USB mode for file transfer, accept the debugging prompt, then reconnect the cable.
- **`INSTALL_FAILED_UPDATE_INCOMPATIBLE`**: remove the older app from the phone and run the install command again. This happens when it was signed with a different key.
- **The app opens but cannot sign in**: confirm the phone has internet access and that the app uses the current `supabase-config.js` configuration.

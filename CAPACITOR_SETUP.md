# Native Mobile Setup Guide: Apple Vision & Google ML Kit v2

This application includes a **4-tier unified hybrid OCR engine** designed to run seamlessly on every device:

| Platform / Runtime | OCR Engine | Underlying Technology | Latency |
| :--- | :--- | :--- | :--- |
| **iOS / iPadOS (Native)** | **Apple Vision** | `VNRecognizeTextRequest` (Apple Neural Engine) | ~20–30ms |
| **Android (Native)** | **Google ML Kit v2** | Google Play Services On-Device ML Kit v2 | ~30–50ms |
| **Modern Desktop / Chrome** | **Native TextDetector** | W3C Shape Detection API (OS hardware accelerated) | ~40–60ms |
| **Universal Web / Safari / PWA** | **Universal On-Device Engine** | WebAssembly LSTM Engine (`Tesseract.js` Fast) | ~400–800ms |

---

## 1. Running as a Web App / PWA (Zero Setup Required)

If you are running the app in standard mobile Safari, Chrome, Firefox, or installed as a PWA:
- The app **automatically** selects the **Universal On-Device Engine** or **Browser Native TextDetector**.
- All image contrast enhancement, sticker isolation, motion-blur filtering, and model parsing execute **100% on the user's device** with zero cloud calls.

---

## 2. Packaging for iOS (Apple Vision Native Bridge)

To enable **Apple Vision (`VNRecognizeTextRequest`)** with native hardware acceleration on iPhone and iPad:

### Step 1: Install Capacitor & OCR Plugin
```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @jcesarmobile/capacitor-ocr
npx cap init "Inventory App" "com.inventory.app"
npx cap add ios
```

### Step 2: Configure Camera Permissions in `Info.plist`
In `ios/App/App/Info.plist`, add:
```xml
<key>NSCameraUsageDescription</key>
<string>We need camera access to scan barcode labels and recognize model codes via Apple Vision.</string>
```

### Step 3: Build & Sync
```bash
npm run build
npx cap sync ios
npx cap open ios
```
*When running on an iOS device, `ScannerView` will automatically detect the native bridge and display the badge:*
> `🍎 Apple Vision (VNRecognizeTextRequest)`

---

## 3. Packaging for Android (Google ML Kit v2 Native Bridge)

To enable **Google ML Kit Text Recognition v2** on-device with Android:

### Step 1: Install Capacitor & ML Kit Plugin
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor-mlkit/text-recognition
npx cap add android
```

### Step 2: Configure Android Permissions in `AndroidManifest.xml`
In `android/app/src/main/AndroidManifest.xml`, ensure:
```xml
<uses-permission android:name="android.permission.CAMERA" />
```

### Step 3: Enable On-Device ML Kit Model Download
In `android/app/src/main/AndroidManifest.xml`, add inside `<application>`:
```xml
<meta-data
    android:name="com.google.ml.resources"
    android:value="ocr" />
```

### Step 4: Build & Sync
```bash
npm run build
npx cap sync android
npx cap open android
```
*When running on an Android device, `ScannerView` will automatically detect the native bridge and display the badge:*
> `🤖 Google ML Kit v2 (ML Kit Text Recognition v2)`

---

## 4. Architecture Summary

The `src/lib/ocrEngine.js` module dynamically cascades through engines:
1. **Checks for Apple Vision native bridge** (`window.Capacitor.Plugins.Ocr` or `window.webkit.messageHandlers.appleVision`).
2. **Checks for Google ML Kit native bridge** (`window.Capacitor.Plugins.TextRecognition` or `window.AndroidMLKit`).
3. **Checks for W3C Shape Detection API** (`window.TextDetector`).
4. **Falls back automatically to Universal On-Device WebAssembly Engine** if native bridges are absent.

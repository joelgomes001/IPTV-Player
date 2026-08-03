# 📺 JTBS IPTV - Indian & Global Live TV Player

A state-of-the-art **IPTV Player** available as a responsive Web Application and a **Universal Android Application** supporting Android Phones, Tablets, and Android TV / Fire TV / Google TV.

---

## 🌟 Features

- 🛰️ **16,109+ Live TV Channels**: Sorted cleanly by **117 Countries** and **299 Genres**.
- 🇮🇳 **Dedicated Doordarshan Genre**: Custom `DD Channels` category for all 56 Doordarshan networks.
- 📱 **Universal Android App**: Native Android package (`com.jtbs.iptv`) supported from **Android 6.0 (API 23)** to **Android 14/15 (API 34/35)**.
- 📺 **Android TV Leanback Support**: D-Pad Remote Navigation (`UP`, `DOWN`, `LEFT`, `RIGHT`, `ENTER`, `BACK`) with focus highlight glow contours and Leanback TV launcher banner.
- 🔄 **Dynamic Live Server Sync**: Real-time channel catalog sync with Firebase backend without requiring APK re-installation when channels change.
- ⚡ **Zero-Lag Performance**: Hardware acceleration and DOM batch chunking for 60fps scrolling across 16,000+ channels.
- 🔍 **Instant Search & Filters**: Search by channel name, country, or genre with instant autocomplete dropdowns.
- ⭐ **Favorites & History**: Save favorite channels with persistent local storage.

---

## 🚀 Live Demo

- 🌐 **Web App**: [https://iptv.jtbsclassic.dpdns.org](https://iptv.jtbsclassic.dpdns.org)

---

## 📱 Android APK Download

Download the pre-compiled Universal Android `.apk` package from Releases

---

## 🛠️ Project Structure

```text
IPTV Player/
├── website/                            # Web Application Source
│   ├── index.html                      # Main Web Interface
│   ├── app.js                          # Core HLS Player & Dynamic Sync Logic
│   ├── styles.css                      # Cyber-Retro Styling
│   └── channels.json                   # 16,109+ Channel Database
├── android/                            # Native Android Application Source
│   ├── build.gradle                    # Gradle Build Configuration
│   ├── app/
│   │   ├── google-services.json        # Firebase Config
│   │   └── src/main/
│   │       ├── AndroidManifest.xml     # Touch + Leanback TV Launcher Manifest
│   │       ├── java/com/jtbs/iptv/
│   │       │   └── MainActivity.java   # Android WebKit Engine & Orientation Logic
│   │       └── res/                    # HD Icon Mipmaps & TV Banner
├── firebase.json                       # Firebase Hosting Configuration
└── README.md                           # Documentation
```

---

## ⚙️ Building from Source

### Prerequisites
- JDK 17+
- Android SDK 34
- Gradle 8.5+

### Build Android Universal APK
```bash
cd android
./gradlew assembleDebug
```
The compiled APK will be located at `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 🔒 Copyright, Ownership & Terms of Use

**Copyright © 2026 Jishu Television's Broadcasting Services (JTBS Classic). All Rights Reserved.**

### 📋 Usage & Distribution License Terms:
- ✅ **Free Distribution & Personal Use**: You are free to use, share, and distribute this application and APK package freely without cost.
- 🚫 **No Modification or Copying**: Unauthorized copying, cloning, reverse-engineering, or extraction of source code, design assets, and database feeds is strictly prohibited.
- 🚫 **No Rebranding**: Rebranding, renaming, reselling, or repackaging this application under any other name, brand, or entity is explicitly forbidden.

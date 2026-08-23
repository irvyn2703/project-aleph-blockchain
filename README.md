# Construction Site Assistant (QVAC)

Expo / React Native app for tracking a construction site with **local** AI (QVAC): budget in SQLite, document expediente with RAG, expense tracking with OCR-confirmed receipts, chat on Home.

Data never leaves the phone. QVAC doesn't run in an emulator or Expo Go: it needs a **physical Android device**.

## What was built with QVAC

QVAC (`@qvac/sdk` [`^0.17.1`](package.json#L14)) runs 100% on-device inside a native Bare worker (`bare-rpc` + `react-native-bare-kit`), with no backend. Three capabilities are used:

| Feature | QVAC model | Purpose |
|---|---|---|
| Chat / tool-calling | `LLAMA_3_2_1B_INST_Q4_0` | Answer questions about the site using tools over SQLite (never invents amounts) |
| Expediente RAG | `GTE_LARGE_FP16` (embeddings) | Index and search the contract/calculation memo uploaded by the user |
| Receipt OCR | `OCR_LATIN` | Read the amount and description off a receipt photo |

> **Current build status:** [`src/qvac/sdk.ts`](src/qvac/sdk.ts) makes `getQvac()` always throw — the Bare worker aborts (`bare-performance` addon, see [`qvac/addons.manifest.json`](qvac/addons.manifest.json)) on this APK. Because of that, none of the three features run at runtime today: chat answers via a deterministic SQLite fallback instead ([`src/qvac/chat.ts#L17-L76`](src/qvac/chat.ts#L17-L76)). The rest of this section describes the integration as it's *wired in the code*, for when the worker gets unblocked.

## Where inference happens (code)

- **Model loading** — [`src/qvac/models.ts`](src/qvac/models.ts)
  - LLM: `downloadAsset` + `loadModel` for `LLAMA_3_2_1B_INST_Q4_0` → [`models.ts#L15-L37`](src/qvac/models.ts#L15-L37)
  - Embeddings: `GTE_LARGE_FP16` → [`models.ts#L39-L53`](src/qvac/models.ts#L39-L53)
  - OCR: `OCR_LATIN`, loaded and unloaded per use → [`models.ts#L55-L73`](src/qvac/models.ts#L55-L73)
- **Actual OCR inference** (`sdk.ocr(...)`) → [`src/qvac/ocr.ts#L4-L14`](src/qvac/ocr.ts#L4-L14)
- **Embedding inference** (`sdk.ragIngest` / `sdk.ragSearch`) → [`src/qvac/rag.ts#L7-L28`](src/qvac/rag.ts#L7-L28)
- **LLM tool-calling contract** (system prompt + tool schema + execution) → [`src/qvac/tools.ts`](src/qvac/tools.ts)
- **Chat turn** (deterministic today; the LLM's hookup point) → [`src/qvac/chat.ts#L78-L86`](src/qvac/chat.ts#L78-L86)
- **Expo native plugin that wires up the SDK** → [`app.json#L48`](app.json#L48) (`"@qvac/sdk/expo-plugin"`)

Honest note: there is no LLM text-generation call wired up yet (only model loading). The inference that does run in the code is OCR and embeddings (RAG); real LLM chat is pending until `getQvac()` stops throwing.

## Model, quantization, and where it runs

- **LLM**: Llama 3.2 1B Instruct, **Q4_0** quantization (`LLAMA_3_2_1B_INST_Q4_0`).
- **Embeddings**: GTE-Large, **FP16** (`GTE_LARGE_FP16`).
- **OCR**: `OCR_LATIN` model (Latin-script text).
- **Where it runs**: on-device, on the phone's GPU (`device: 'gpu'`, `ctx_size: 2048` in [`models.ts#L27-L31`](src/qvac/models.ts#L27-L31)), inside the Bare worker — **no** cloud calls.
- **Approximate latency**: _pending — will be added in a future update._

## Setup on a fresh machine

### 0. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS or newer (developed on 24.x) | `node -v` |
| npm | ships with Node | `npm -v` |
| JDK | **17** (Temurin/Zulu) | Required by the Android Gradle Plugin used by RN 0.81 / Expo SDK 54. JDK 21+ is not supported. |
| Android SDK | Platform 35 + Build-Tools 35, NDK, CMake | Easiest via Android Studio → SDK Manager |
| Android device | **physical**, Android 10+ (`minSdkVersion 29`) | USB debugging on. QVAC does **not** run in an emulator or Expo Go. |

Set the Android env vars (skip if Android Studio already did it):

```bash
# macOS / Linux — add to ~/.zshrc or ~/.bashrc
export ANDROID_HOME="$HOME/Library/Android/sdk"   # Linux: $HOME/Android/Sdk
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
export JAVA_HOME="$(/usr/libexec/java_home -v 17)" # macOS only
```

```powershell
# Windows (PowerShell, persistent)
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17..."
# then add %ANDROID_HOME%\platform-tools to PATH
```

Verify: `java -version` → 17.x, and `adb devices` lists your phone as `device` (accept the USB debugging prompt on the phone).

### 1. Clone and install

```bash
git clone https://github.com/irvyn2703/project-aleph-blockchain.git
cd project-aleph-blockchain
npm install
```

No `.env` file is needed — the app has no backend and reads no environment variables.

### 2. Generate the native project + QVAC worker

`android/`, `ios/` and `qvac/` are **gitignored on purpose** ([.gitignore](.gitignore)) — the QVAC worker bundle is ~11 MB and embeds absolute paths from the machine that built it, so it must be regenerated locally:

```bash
npx expo prebuild
```

This runs the `@qvac/sdk/expo-plugin` ([app.json](app.json)), which bundles `qvac/worker.bundle.js` from [qvac.config.json](qvac.config.json) and writes the `android/` project.

### 3. Run on the device

```bash
npm run android      # == expo run:android --device
```

Pick your device when prompted. The first build compiles the native code and takes several minutes; later runs reuse it and only reload JS.

On first launch the app downloads the QVAC models (LLM, embeddings, OCR) to the device — keep it on Wi-Fi and give it a few minutes.

### 4. Verify the toolchain

```bash
npm run verify       # typecheck + lint + tests
```

Individually: `npm run typecheck` (`tsc --noEmit`), `npm run lint`, `npm test` (Vitest), `npm run format`.

### Optional: EAS builds

`eas.json` defines `development`, `preview` (APK) and `production` profiles against project `aleph-hackathon` (owner `enriquerv`). To build in the cloud you need access to that Expo project:

```bash
npx eas login
npx eas build --profile preview --platform android
```

### Troubleshooting

- **`SDK location not found` / Gradle can't find the SDK** — `ANDROID_HOME` isn't set in the shell that runs the build; re-open the terminal after exporting it.
- **`Unsupported class file major version` or a Gradle/Kotlin JVM error** — you're on the wrong JDK. Confirm `java -version` reports 17.
- **No device listed** — `adb devices`; unplug/replug, accept the RSA prompt on the phone, and make sure it's not in "charge only" mode.
- **App crashes on start after pulling new commits** — re-run `npx expo prebuild` (the QVAC worker or native config may have changed). Use `npx expo prebuild --clean` to regenerate from scratch.
- **Stale Metro cache** — `npx expo start --clear`.
- **Nuclear reset** — `rm -rf node_modules android qvac && npm install && npx expo prebuild`.

## Excel

One sheet with columns:

`clave_partida, nombre_partida, clave_concepto, descripcion, um, cantidad, pu, importe`

## Demo

1. "What's the total budget for the site and for the cimentación item?"
2. "What does the contract say about deadlines and penalties?"
3. Log an expense → "How much have we spent vs. budget on CIM-01?"

If QVAC hasn't loaded yet, chat still answers those numeric and legal demo questions from SQLite.

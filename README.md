# planner

Expo / React Native app for a construction site: local SQLite budget, expediente with RAG, expenses with OCR-confirmed receipts, and an on-device assistant.

Data never leaves the phone. QVAC (`@qvac/sdk` [`^0.17.1`](package.json)) runs inside a native Bare worker — it needs a **physical Android device**, not an emulator or Expo Go.

## Screens

| Tab        | What it does                                                                    |
| ---------- | ------------------------------------------------------------------------------- |
| Inicio     | Site overview and entry to Presupuestos                                         |
| Expediente | Upload contracts, calculation memos, photos; OCR + RAG ingest; document preview |
| Capturar   | Log expenses (Excel import or camera/gallery OCR)                               |
| Asistente  | Chat: Llama 3.2 1B with tools over SQLite/RAG, SQL fallback for exact amounts   |

## What runs on QVAC

QVAC runs 100% on-device (`bare-rpc` + `react-native-bare-kit`), with no backend. The Expo plugin wires the worker (`"@qvac/sdk/expo-plugin"` in [`app.json`](app.json)).

| Feature                | Model                                         | Purpose                                                                                |
| ---------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| Chat / tool-calling    | `LLAMA_3_2_1B_INST_Q4_0`                      | Answer site questions via tools over SQLite and the expediente. Never invents amounts. |
| Expediente RAG         | `GTE_LARGE_FP16`                              | Index and search uploaded contracts / memos                                            |
| Receipt & document OCR | `OCR_DOCTR` (DocTR: DBNet + CRNN MobileNetV3) | Read amount/description from a receipt, or text from expediente photos                 |

### Where inference happens

- **Model loading** — [`src/qvac/models.ts`](src/qvac/models.ts)
  - LLM: `downloadAsset` + `loadModel` for `LLAMA_3_2_1B_INST_Q4_0`
  - Embeddings: `GTE_LARGE_FP16`
  - OCR: `OCR_DOCTR`, loaded and unloaded per use (`withOcr`)
- **LLM turn** (`completion` + tools, streamed) — [`src/qvac/chat.ts`](src/qvac/chat.ts)
- **Tool contract** (system prompt + schema + SQLite/RAG execution) — [`src/qvac/tools.ts`](src/qvac/tools.ts)
- **Routing / rescue** (numeric SQL short-circuit, raw tool-call parse, invented-amount check) — [`src/qvac/routing.ts`](src/qvac/routing.ts)
- **OCR** (`sdk.ocr`) — [`src/qvac/ocr.ts`](src/qvac/ocr.ts)
- **RAG** (chunk → embed → `ragSaveEmbeddings` / `ragSearch`) — [`src/qvac/rag.ts`](src/qvac/rag.ts)
- **Worker shutdown** — [`src/qvac/sdk.ts`](src/qvac/sdk.ts)

Exact totals and spent-vs-budget questions go straight to SQLite ([`esConsultaNumericaDirecta`](src/qvac/routing.ts)). If the LLM is still downloading, out of memory, or the worker fails, chat falls back to the same deterministic SQLite answers.

### Model, quantization, and where it runs

- **LLM**: Llama 3.2 1B Instruct, **Q4_0** (`LLAMA_3_2_1B_INST_Q4_0`), `ctx_size: 2048`, tools on.
- **Embeddings**: GTE-Large, **FP16** (`GTE_LARGE_FP16`). Stable RAG id: `gte-large-fp16` (not the per-session `loadModel` handle).
- **OCR**: DocTR pipeline (`OCR_DOCTR`), `langList: ['en']` (Latin alphabet, including Spanish accents/ñ).
- **Where it runs**: on-device **CPU** (`device: 'cpu'`, `gpu_layers: 0`). GPU upload of these models exhausted memory on the target device and got the process killed. Vulkan is excluded for Adreno (`libqvac-ggml-vulkan.so` in [`app.json`](app.json)).
- **Latency**: first launch downloads the models. OCR and LLM are on-device after that; numbers depend on the phone.

## Setup on a fresh machine

### 0. Prerequisites

| Tool           | Version                                        | Notes                                                                                          |
| -------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Node.js        | 20 LTS or newer (developed on 24.x)            | `node -v`                                                                                      |
| npm            | ships with Node                                | `npm -v`                                                                                       |
| JDK            | **17** (Temurin/Zulu)                          | Required by the Android Gradle Plugin used by RN 0.81 / Expo SDK 54. JDK 21+ is not supported. |
| Android SDK    | Platform 35 + Build-Tools 35, NDK, CMake       | Easiest via Android Studio → SDK Manager                                                       |
| Android device | **physical**, Android 10+ (`minSdkVersion 29`) | USB debugging on. QVAC does **not** run in an emulator or Expo Go.                             |

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

| Script                      | What                                           |
| --------------------------- | ---------------------------------------------- |
| `npm run typecheck`         | `tsc --noEmit`                                 |
| `npm run lint` / `lint:fix` | ESLint                                         |
| `npm run test`              | Vitest (parse, classify, routing, OCR helpers) |
| `npm run format`            | Prettier                                       |

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

Import lives in Presupuestos (budget) and Capturar (expenses). Header row can sit below metadata; aliases accept public-works headings (`cantidad_o_volumen`, `precios_costo_directo`, …). Amounts use es-AR (`1.234,56`). Importe is always recalculated as cantidad × PU.

**Budget — flat template** (one row per concepto):

`clave_partida, nombre_partida, clave_concepto, descripcion, um, cantidad, pu, importe`

**Budget — hierarchical official sheet**: partida rows (name + subtotal, no cantidad/PU) followed by their conceptos. Detected automatically when `clave_partida` is missing.

**Expenses:**

`clave_partida, monto, descripcion, fecha` (fecha `AAAA-MM-DD`; today if missing)

Importing a budget replaces the previous one and deletes existing expenses. Expense rows whose `clave_partida` does not exist are skipped.

## Demo

1. Import a budget Excel in Presupuestos.
2. "¿Cuál es el total de la obra y de la partida de cimentación?"
3. Upload the contract in Expediente → "¿Qué dice el contrato sobre plazos y multas?"
4. Log an expense (Excel or photo) → "¿Cuánto llevamos gastado vs presupuesto en CIM-01?"

Numeric questions answer from SQLite even before the LLM finishes loading.

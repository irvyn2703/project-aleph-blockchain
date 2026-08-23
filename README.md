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

## Setup

```bash
npm install
npx expo prebuild
npx expo run:android --device
```

- Requires a **physical Android device** connected (QVAC doesn't run in an emulator or Expo Go).
- Windows: the native Android prebuild requires JDK + Android SDK.
- First launch downloads the models (LLM, embeddings, OCR) to the device.
- `npm run typecheck` runs `tsc --noEmit` for type checking.

## Excel

One sheet with columns:

`clave_partida, nombre_partida, clave_concepto, descripcion, um, cantidad, pu, importe`

## Demo

1. "What's the total budget for the site and for the cimentación item?"
2. "What does the contract say about deadlines and penalties?"
3. Log an expense → "How much have we spent vs. budget on CIM-01?"

If QVAC hasn't loaded yet, chat still answers those numeric and legal demo questions from SQLite.

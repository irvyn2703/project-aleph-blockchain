# Asistente de obra (QVAC)

App Expo / React Native para seguimiento de una obra con IA **local** (QVAC): presupuesto en SQLite, expediente con RAG, gastos con OCR confirmado, chat en Home.

Los datos no salen del teléfono. QVAC no corre en emulador ni en Expo Go: hace falta **Android físico**.

## Correr

```bash
npm install
npx expo prebuild
npx expo run:android --device
```

Windows: el prebuild nativo de Android requiere JDK + Android SDK. El primer arranque descarga el LLM (Llama 3.2 1B).

## Excel

Una hoja con columnas:

`clave_partida, nombre_partida, clave_concepto, descripcion, um, cantidad, pu, importe`

## Demo

1. "¿Cuál es el total de la obra y de la partida de cimentación?"
2. "¿Qué dice el contrato sobre plazos y multas?"
3. Registrar un gasto → "¿Cuánto llevamos gastado vs presupuesto en CIM-01?"

Si QVAC todavía no cargó, el chat igual responde esas preguntas numéricas y legales de demo desde SQLite.

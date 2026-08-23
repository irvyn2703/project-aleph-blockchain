import { close } from '@qvac/sdk';

/**
 * Ciclo de vida del worker QVAC.
 *
 * No hace falta arrancarlo a mano: el cliente RPC de Expo (`expo-rpc-client`)
 * crea el Worklet de forma lazy y singleton en la primera llamada al SDK
 * (loadModel, ocr, ragIngest, …). Por eso acá solo se expone el apagado.
 */

/**
 * Apaga el worker Bare de forma ordenada.
 *
 * El SDK hace un handshake `__shutdown__` antes de terminar el worklet para
 * que los addons liberen sus referencias al isolate de V8. Sin ese paso, el
 * siguiente worklet crashea al primer `setLogger`. Importa sobre todo en
 * desarrollo, donde el fast-refresh puede recrear el worker.
 *
 * Es best-effort: nunca lanza, para no tumbar la app durante el cierre.
 */
export async function shutdownQvac(): Promise<void> {
  try {
    await close();
  } catch {
    // El worker puede no haber arrancado nunca; apagarlo es un no-op.
  }
}

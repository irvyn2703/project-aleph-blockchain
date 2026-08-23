export async function getQvac(): Promise<never> {
  throw new Error(
    'QVAC no se arranca en este APK: el worker Bare aborta (bare-performance addon). El resto de la app usa SQLite.'
  );
}

import { defineConfig } from 'vitest/config';

// Solo se testea lógica pura (parsers, formateo, reconciliación de datos).
// Nada que importe módulos nativos de Expo/RN entra acá: esos se verifican en device.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

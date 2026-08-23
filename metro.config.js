// Learn more https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Los polyfills de globals van acá, no en index.ts.
//
// React Native inicializa su runtime (createPerformanceLogger lee
// `global.performance.now()`) antes de evaluar el módulo de entrada, así que
// un require() al principio de index.ts ya llega tarde: la app moría con
// "Cannot read property 'now' of undefined" antes de correr una sola línea
// propia. Los módulos que Metro devuelve acá se evalúan antes que todo el
// bundle, que es el único punto donde definir estos globals sirve.
const upstreamGetPolyfills = config.serializer.getPolyfills;
config.serializer.getPolyfills = (options) => [
  ...upstreamGetPolyfills(options),
  path.resolve(__dirname, 'src/polyfills.js'),
];

module.exports = config;

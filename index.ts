import { registerRootComponent } from 'expo';

import App from './App';

// Los polyfills de globals (performance.now, FormData, Blob, File) los inyecta
// Metro antes que este módulo — ver metro.config.js y src/polyfills.js.
registerRootComponent(App);

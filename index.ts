// `require` a propósito, no `import`: los imports ESM se hoistean y se
// evalúan todos antes del cuerpo del módulo, así que un `import './polyfills'`
// no garantiza que los globals existan cuando se evalúan los demás módulos.
// El SDK toca FormData/Blob/File al cargarse, y sin polyfill Hermes tira
// "Property 'FormData' doesn't exist" y aborta el proceso.
require('./src/polyfills');

const { registerRootComponent } = require('expo');
const App = require('./App').default;

registerRootComponent(App);

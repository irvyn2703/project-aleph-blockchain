/* eslint-disable no-undef */
/**
 * Globals que Hermes no trae y que React Native y el SDK de QVAC esperan.
 *
 * Este archivo lo carga Metro como polyfill (ver metro.config.js), no el
 * sistema de módulos: se evalúa antes que el resto del bundle. Por eso es JS
 * plano sin imports ni exports — en esta fase no hay `require` disponible.
 *
 * Sin esto la app aborta antes de renderizar:
 *   - "Cannot read property 'now' of undefined" (createPerformanceLogger de RN)
 *   - "Property 'FormData' doesn't exist" (el cliente del SDK al cargarse)
 */
(function polyfillGlobals(g) {
  if (typeof g.nativePerformanceNow !== 'function') {
    g.nativePerformanceNow = function () {
      return Date.now();
    };
  }

  if (g.performance == null || typeof g.performance.now !== 'function') {
    g.performance = Object.assign({}, g.performance, {
      now: function () {
        return Date.now();
      },
    });
  }

  if (g.FormData == null) {
    g.FormData = function FormData() {
      this._parts = [];
    };
    g.FormData.prototype = {
      append: function (name, value, filename) {
        this._parts.push({ name: name, value: value, filename: filename });
      },
      delete: function (name) {
        this._parts = this._parts.filter(function (p) {
          return p.name !== name;
        });
      },
      get: function (name) {
        const hit = this._parts.find(function (p) {
          return p.name === name;
        });
        return hit ? hit.value : null;
      },
      getAll: function (name) {
        return this._parts
          .filter(function (p) {
            return p.name === name;
          })
          .map(function (p) {
            return p.value;
          });
      },
      has: function (name) {
        return this._parts.some(function (p) {
          return p.name === name;
        });
      },
      set: function (name, value, filename) {
        this.delete(name);
        this.append(name, value, filename);
      },
      forEach: function (cb) {
        const self = this;
        this._parts.forEach(function (p) {
          cb(p.value, p.name, self);
        });
      },
    };
  }

  // Blob y File se definen para que el SDK no explote al referenciarlos al
  // cargarse. Son marcadores: guardan los datos que reciben pero no los
  // decodifican. Cualquier lectura real falla fuerte en vez de devolver vacío
  // en silencio, que es imposible de diagnosticar después.
  if (g.Blob == null) {
    g.Blob = function Blob(parts, opts) {
      this._parts = parts || [];
      this.type = (opts && opts.type) || '';
      this.size = 0;
    };
    g.Blob.prototype.text = function () {
      return Promise.reject(new Error('Blob.text() no está implementado en este polyfill.'));
    };
    g.Blob.prototype.arrayBuffer = function () {
      return Promise.reject(new Error('Blob.arrayBuffer() no está implementado en este polyfill.'));
    };
    g.Blob.prototype.slice = function () {
      throw new Error('Blob.slice() no está implementado en este polyfill.');
    };
  }

  if (g.File == null) {
    g.File = function File(bits, name, opts) {
      this._bits = bits;
      this.name = name;
      this.type = (opts && opts.type) || '';
      this.lastModified = Date.now();
      this.size = 0;
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : global);

const g = globalThis as Record<string, unknown>;

if (typeof g.nativePerformanceNow !== 'function') {
  g.nativePerformanceNow = () => Date.now();
}
if (g.performance == null || typeof (g.performance as { now?: unknown }).now !== 'function') {
  g.performance = { now: () => Date.now() };
}

class FormDataPolyfill {
  private parts: Array<{ name: string; value: unknown; filename?: string }> = [];

  append(name: string, value: unknown, filename?: string) {
    this.parts.push({ name, value, filename });
  }

  delete(name: string) {
    this.parts = this.parts.filter((p) => p.name !== name);
  }

  get(name: string) {
    return this.parts.find((p) => p.name === name)?.value ?? null;
  }

  getAll(name: string) {
    return this.parts.filter((p) => p.name === name).map((p) => p.value);
  }

  has(name: string) {
    return this.parts.some((p) => p.name === name);
  }

  set(name: string, value: unknown, filename?: string) {
    this.delete(name);
    this.append(name, value, filename);
  }

  forEach(cb: (value: unknown, name: string, fd: FormDataPolyfill) => void) {
    for (const p of this.parts) cb(p.value, p.name, this);
  }

  *entries() {
    for (const p of this.parts) yield [p.name, p.value] as const;
  }

  *keys() {
    for (const p of this.parts) yield p.name;
  }

  *values() {
    for (const p of this.parts) yield p.value;
  }
}

if (g.FormData == null) g.FormData = FormDataPolyfill;
if (g.Blob == null) {
  g.Blob = class BlobPolyfill {
    size = 0;
    type = '';
    constructor(parts?: unknown[], opts?: { type?: string }) {
      this.type = opts?.type ?? '';
      this.size = Array.isArray(parts) ? parts.length : 0;
    }
    async text() {
      return '';
    }
    async arrayBuffer() {
      return new ArrayBuffer(0);
    }
    slice() {
      return new (g.Blob as typeof BlobPolyfill)();
    }
  };
}
if (g.File == null) {
  g.File = class FilePolyfill {
    name: string;
    lastModified = Date.now();
    size = 0;
    type = '';
    constructor(_bits: unknown, name: string, opts?: { type?: string }) {
      this.name = name;
      this.type = opts?.type ?? '';
    }
  };
}

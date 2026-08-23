/**
 * Decisiones de enrutado y validación del chat.
 *
 * Vive aparte de `chat.ts` porque ese módulo importa el SDK y las queries de
 * SQLite, que arrastran react-native y no resuelven fuera del runtime nativo.
 * Acá no hay dependencias, así que se testea en Node.
 */

/**
 * ¿La pregunta es una consulta numérica que SQL responde exacto?
 *
 * Para el total de la obra o gastado-vs-presupuesto, la consulta directa no
 * puede perder contra el modelo: responde en milisegundos y con la cifra
 * exacta. Un Llama 1B cuantizado, en cambio, puede emitir un número plausible
 * en vez de llamar la tool — el peor error posible en una app cuyo pitch es
 * que nunca inventa importes.
 */
export function esConsultaNumericaDirecta(userText: string): boolean {
  const t = userText.toLowerCase();
  const pideTotal = /total|presupuesto de la obra|monto (total|de la obra)/.test(t);
  const pideDesvio = /gastad|desv[ií]o|vs presupuesto|contra presupuesto/.test(t);
  return pideTotal || pideDesvio;
}

/**
 * ¿La respuesta es un tool-call que quedó sin parsear?
 *
 * Cuando el formato que emite el modelo no coincide con ningún dialecto, el
 * SDK no reconoce la llamada y la deja pasar como texto: el usuario termina
 * viendo `{"name": "get_partida", ...}` en el chat.
 */
export function pareceToolCallCrudo(texto: string): boolean {
  const t = texto.trim();
  if (!/[{[]/.test(t.slice(0, 3))) return false;
  return /"(name|function|parameters|arguments)"\s*:/.test(t);
}

export type ToolCallRescatado = { name: string; args: Record<string, unknown> };

/** Tools cuyo argumento de búsqueda es obligatorio. */
const TOOLS_CON_QUERY = new Set(['buscar_expediente', 'buscar_concepto']);

export function requiereQuery(name: string): boolean {
  return TOOLS_CON_QUERY.has(name);
}

/** ¿El tool-call trae una query usable, o vino vacía? */
export function tieneQuery(args: Record<string, unknown>): boolean {
  return typeof args.query === 'string' && args.query.trim().length > 0;
}

/**
 * Rescata un tool-call del texto crudo del modelo.
 *
 * Llama 3.2 1B emite `{"name": ..., "parameters": {...}}`, pero los parsers
 * del SDK esperan `arguments`, así que ningún dialecto lo reconoce y la
 * llamada llega como texto. Antes que descartarla, se lee acá: el modelo
 * eligió bien la tool, solo nombró distinto el campo.
 *
 * Acepta las dos claves y tolera el anidado que a veces produce
 * (`{name, parameters: {function: "get_partida", parameters: {...}}}`).
 */
export function rescatarToolCall(texto: string, nombresValidos: string[]): ToolCallRescatado | null {
  const inicio = texto.indexOf('{');
  if (inicio < 0) return null;

  let json: unknown;
  try {
    json = JSON.parse(texto.slice(inicio, texto.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;

  // El nombre real de la tool puede estar en `name` o, cuando el modelo anida,
  // en `parameters.function`.
  const obj = json as Record<string, unknown>;
  const anidado = (obj.parameters ?? obj.arguments) as Record<string, unknown> | undefined;
  const candidatos = [obj.name, obj.function, anidado?.function].filter(
    (v): v is string => typeof v === 'string'
  );
  const name = candidatos.find((c) => nombresValidos.includes(c));
  if (!name) return null;

  // Los argumentos pueden estar un nivel más abajo si venía anidado.
  const nivel2 = (anidado?.parameters ?? anidado?.arguments) as Record<string, unknown> | undefined;
  const args = nivel2 ?? anidado ?? {};
  const limpios = Object.fromEntries(
    Object.entries(args).filter(([k]) => k !== 'function' && k !== 'type' && k !== 'name')
  );
  return { name, args: limpios };
}

/**
 * Extrae los excerpts de un resultado JSON de `buscar_expediente`.
 *
 * Devuelve `[]` si el resultado no es del expediente o no trajo hits, así el
 * llamador distingue "no hay nada que redactar" de "hay texto para el modelo".
 */
export function extraerExcerpts(resultadoTool: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultadoTool);
  } catch {
    return [];
  }
  const hits = (parsed as { hits?: unknown }).hits;
  if (!Array.isArray(hits)) return [];
  return hits
    .map((h) => (h as { excerpt?: unknown }).excerpt)
    .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
    .map((e) => e.trim());
}

/**
 * Prompt de la pasada de redacción.
 *
 * El modelo ya eligió bien la tool y el RAG ya trajo el fragmento correcto;
 * lo único que falta es que alguien lea ese texto y conteste. Se le da el
 * fragmento y la pregunta, sin tools, para que no vuelva a intentar llamarlas.
 *
 * Las instrucciones son deliberadamente cortas y concretas: un modelo de 1B
 * ignora los prompts largos y vuelve a copiar el texto de entrada.
 */
export function promptDeRedaccion(pregunta: string, excerpts: string[]): string {
  return [
    'Fragmentos del expediente:',
    '"""',
    excerpts.join('\n---\n'),
    '"""',
    '',
    `Pregunta: ${pregunta}`,
    '',
    'Respondé la pregunta en UNA o DOS oraciones, usando SOLO los fragmentos.',
    'No copies el fragmento entero ni lo transcribas. No inventes datos.',
    'Si el fragmento no contiene la respuesta, decí exactamente: NO_ESTA.',
  ].join('\n');
}

/** El modelo declaró que el fragmento no tenía la respuesta. */
export function esNoEsta(texto: string): boolean {
  return /\bNO_ESTA\b/i.test(texto.trim());
}

/**
 * ¿La "redacción" es en realidad el fragmento copiado?
 *
 * El modo de fallo característico de un modelo chico cuando se le pide
 * resumir: devuelve la entrada casi tal cual. Si pasa, la redacción no sirve
 * y conviene caer al excerpt crudo, que al menos es fiel.
 *
 * Se compara por prefijo normalizado —sin espacios ni saltos— porque el
 * modelo suele reformatear los saltos de línea del OCR al copiar.
 */
export function pareceCopiaDelExcerpt(texto: string, excerpts: string[]): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const t = norm(texto);
  if (!t) return true;
  return excerpts.some((e) => {
    const cabeza = norm(e).slice(0, 120);
    return cabeza.length >= 40 && t.includes(cabeza);
  });
}

/**
 * Detecta importes en el texto del modelo que no aparecen en ningún resultado
 * de tool de este turno.
 *
 * Última defensa contra la alucinación de cifras, y la única que no depende de
 * la buena voluntad de un modelo de 1B: si el número no salió de SQLite, no
 * puede presentarse como dato de la obra.
 */
export function detectarImportesInventados(texto: string, resultadosTools: string[]): boolean {
  const enTools = resultadosTools.join(' ').replace(/\D/g, ' ');
  const importes = texto.match(/\$\s?[\d.]+(?:,\d{2})?|\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b/g) ?? [];
  return importes.some((imp) => {
    // Se comparan solo los dígitos enteros: "$ 15.400,00" y el 15400 que
    // devolvió la tool son el mismo importe escrito distinto.
    const digitos = imp.replace(/,\d{2}$/, '').replace(/\D/g, '');
    return digitos.length >= 4 && !enTools.includes(digitos);
  });
}

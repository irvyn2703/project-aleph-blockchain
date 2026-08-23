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

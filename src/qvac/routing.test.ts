import { describe, expect, it } from 'vitest';
import {
  detectarImportesInventados,
  esConsultaNumericaDirecta,
  esNoEsta,
  extraerExcerpts,
  pareceCopiaDelExcerpt,
  pareceToolCallCrudo,
  promptDeRedaccion,
  requiereQuery,
  rescatarToolCall,
  tieneQuery,
} from './routing';

/**
 * El OCR real del oficio, tal como quedó indexado en device.
 *
 * Se conserva con su ruido —barra de estado del teléfono, saltos de línea
 * partiendo el nombre del firmante— porque es exactamente lo que la pasada de
 * redacción tiene que saber digerir.
 */
const EXCERPT_OFICIO = `[legal:1000001840.png]
23:10
084 %
Oficios Presidentepdf
GOzOilA
DepeNDENcia:
AYUNTAMIENTO DE ZONGOZOTL
SECCION:
PRESIDENCIA MUNICIPAL
EXPEDIENTE:
UNICO
UC LAURO SANCHEZ LOPEZ
DIRECTOR GENERAL
CEASPUE
PResenTe:
EL
QUE SUSCRIBE
U
JOEL
HERNANDEZ
ZARAGOZA
PRESIDENTE
MUNICIPAL
CONSTITUCIONAL
DE
ZONGOZOTLA , PUEBLA, POR ESTE CONDUCTO LE ENVIO UN
CORDIAL SALUDO`;

describe('requiereQuery / tieneQuery', () => {
  it('marca las tools de búsqueda de texto', () => {
    expect(requiereQuery('buscar_expediente')).toBe(true);
    expect(requiereQuery('buscar_concepto')).toBe(true);
  });

  it('no marca las tools de importes', () => {
    expect(requiereQuery('total_obra')).toBe(false);
    expect(requiereQuery('get_partida')).toBe(false);
  });

  it('detecta la query faltante que el modelo omite', () => {
    // El caso real: el modelo llamó buscar_expediente sin query y la tool
    // falló con "Query cannot be empty".
    expect(tieneQuery({})).toBe(false);
    expect(tieneQuery({ query: '' })).toBe(false);
    expect(tieneQuery({ query: '   ' })).toBe(false);
  });

  it('acepta una query con contenido', () => {
    expect(tieneQuery({ query: 'quién firma el oficio' })).toBe(true);
  });
});

describe('extraerExcerpts', () => {
  it('saca los excerpts del resultado de buscar_expediente', () => {
    const resultado = JSON.stringify({
      hits: [
        { score: 0.8, excerpt: EXCERPT_OFICIO },
        { score: 0.5, excerpt: 'otro fragmento' },
      ],
    });
    expect(extraerExcerpts(resultado)).toEqual([EXCERPT_OFICIO.trim(), 'otro fragmento']);
  });

  it('devuelve vacío cuando el RAG no encontró nada', () => {
    expect(extraerExcerpts(JSON.stringify({ hits: [], nota: 'Nada en el índice RAG.' }))).toEqual([]);
  });

  it('devuelve vacío ante el JSON de una tool de importes', () => {
    // El resultado de total_obra no tiene hits: no hay nada que redactar.
    expect(extraerExcerpts('{"obra":"Tanque","total":15400}')).toEqual([]);
  });

  it('devuelve vacío ante un error de la tool o un JSON roto', () => {
    expect(extraerExcerpts('{"error":"RAG no disponible"}')).toEqual([]);
    expect(extraerExcerpts('no es json')).toEqual([]);
  });

  it('descarta excerpts vacíos', () => {
    const resultado = JSON.stringify({ hits: [{ excerpt: '   ' }, { excerpt: 'útil' }] });
    expect(extraerExcerpts(resultado)).toEqual(['útil']);
  });
});

describe('promptDeRedaccion', () => {
  it('incluye la pregunta y el fragmento', () => {
    const p = promptDeRedaccion('¿Según el oficio quién es el remitente?', [EXCERPT_OFICIO]);
    expect(p).toContain('¿Según el oficio quién es el remitente?');
    expect(p).toContain('JOEL');
    expect(p).toContain('NO_ESTA');
  });

  it('separa varios fragmentos', () => {
    const p = promptDeRedaccion('¿qué dice?', ['uno', 'dos']);
    expect(p).toContain('uno\n---\ndos');
  });
});

describe('esNoEsta', () => {
  it('reconoce la declaración de que el dato no está', () => {
    expect(esNoEsta('NO_ESTA')).toBe(true);
    expect(esNoEsta('  no_esta  ')).toBe(true);
  });

  it('no confunde una respuesta normal', () => {
    expect(esNoEsta('El remitente es Joel Hernández Zaragoza.')).toBe(false);
  });
});

describe('pareceCopiaDelExcerpt', () => {
  it('detecta el fragmento devuelto tal cual', () => {
    // El modo de fallo que motivó todo esto: el usuario veía el OCR crudo,
    // barra de estado del teléfono incluida, en vez de una respuesta.
    expect(pareceCopiaDelExcerpt(EXCERPT_OFICIO, [EXCERPT_OFICIO])).toBe(true);
  });

  it('detecta la copia aunque el modelo reformatee los saltos de línea', () => {
    const reformateado = EXCERPT_OFICIO.replace(/\n/g, ' ');
    expect(pareceCopiaDelExcerpt(reformateado, [EXCERPT_OFICIO])).toBe(true);
  });

  it('acepta una redacción genuina', () => {
    const buena = 'El remitente es Joel Hernández Zaragoza, presidente municipal de Zongozotla.';
    expect(pareceCopiaDelExcerpt(buena, [EXCERPT_OFICIO])).toBe(false);
  });

  it('trata el texto vacío como inservible', () => {
    expect(pareceCopiaDelExcerpt('   ', [EXCERPT_OFICIO])).toBe(true);
  });

  it('no marca una respuesta corta contra un fragmento corto', () => {
    // Un fragmento muy chico no da evidencia suficiente de copia.
    expect(pareceCopiaDelExcerpt('El plazo es de 90 días.', ['90 días'])).toBe(false);
  });
});

describe('rescatarToolCall', () => {
  const validas = ['total_obra', 'get_partida', 'buscar_concepto', 'gastado_vs_presupuesto', 'buscar_expediente'];

  it('rescata la forma anidada que emite Llama 3.2 1B', () => {
    // Capturado en device: el SDK no lo parsea porque usa `parameters`
    // donde sus dialectos esperan `arguments`.
    const crudo =
      '{"name": "CONSTRucción", "parameters": {"type": "function", "function": "get_partida", "parameters": {"clave_o_nombre": "CONSTRucción"}}}';
    expect(rescatarToolCall(crudo, validas)).toEqual({
      name: 'get_partida',
      args: { clave_o_nombre: 'CONSTRucción' },
    });
  });

  it('rescata la forma plana con parameters', () => {
    const crudo = '{"name": "buscar_expediente", "parameters": {"query": "tanque"}}';
    expect(rescatarToolCall(crudo, validas)).toEqual({
      name: 'buscar_expediente',
      args: { query: 'tanque' },
    });
  });

  it('acepta también la convención estándar con arguments', () => {
    const crudo = '{"name": "total_obra", "arguments": {}}';
    expect(rescatarToolCall(crudo, validas)).toEqual({ name: 'total_obra', args: {} });
  });

  it('ignora tools que no existen', () => {
    expect(rescatarToolCall('{"name": "borrar_todo", "parameters": {}}', validas)).toBeNull();
  });

  it('devuelve null ante texto que no es JSON', () => {
    expect(rescatarToolCall('El total es $ 15.400,00.', validas)).toBeNull();
    expect(rescatarToolCall('{roto', validas)).toBeNull();
  });

  it('tolera texto alrededor del JSON', () => {
    const crudo = 'Voy a consultar: {"name": "total_obra", "parameters": {}} listo';
    expect(rescatarToolCall(crudo, validas)?.name).toBe('total_obra');
  });
});

describe('pareceToolCallCrudo', () => {
  it('reconoce el tool-call que el modelo emitió como texto', () => {
    // Capturado en device: el SDK no parseó la llamada y el JSON llegó al chat.
    const crudo =
      '{"name": "CONSTRucción", "parameters": {"type": "function", "function": "get_partida", "parameters": {"clave_o_nombre": "CONSTRucción"}}}';
    expect(pareceToolCallCrudo(crudo)).toBe(true);
  });

  it('reconoce la variante con arguments', () => {
    expect(pareceToolCallCrudo('{"name":"total_obra","arguments":{}}')).toBe(true);
  });

  it('deja pasar una respuesta normal en prosa', () => {
    expect(pareceToolCallCrudo('El total del presupuesto es $ 15.400,00.')).toBe(false);
  });

  it('no marca prosa que menciona llaves', () => {
    expect(pareceToolCallCrudo('La partida {CIM-01} suma 15.400 pesos.')).toBe(false);
  });

  it('tolera espacios y saltos al principio', () => {
    expect(pareceToolCallCrudo('\n  {"name": "get_partida", "parameters": {}}')).toBe(true);
  });
});

describe('esConsultaNumericaDirecta', () => {
  it('enruta a SQL las preguntas por el total de la obra', () => {
    expect(esConsultaNumericaDirecta('¿cuál es el total del presupuesto?')).toBe(true);
    expect(esConsultaNumericaDirecta('monto total de la obra')).toBe(true);
  });

  it('enruta a SQL las preguntas de gastado vs presupuesto', () => {
    expect(esConsultaNumericaDirecta('¿cuánto llevamos gastado?')).toBe(true);
    expect(esConsultaNumericaDirecta('desvío contra presupuesto')).toBe(true);
    expect(esConsultaNumericaDirecta('gastado vs presupuesto en CIM-01')).toBe(true);
  });

  it('deja al LLM las preguntas abiertas sobre documentos', () => {
    // Estas son las que antes caían en el mensaje genérico: el enrutado por
    // intención existe para que lleguen al modelo con sus tools.
    expect(esConsultaNumericaDirecta('¿qué dice el oficio del tanque?')).toBe(false);
    expect(esConsultaNumericaDirecta('¿qué pasa con la concesión del manantial?')).toBe(false);
    expect(esConsultaNumericaDirecta('resumime el expediente')).toBe(false);
  });

  it('no se confunde con mayúsculas ni acentos', () => {
    expect(esConsultaNumericaDirecta('TOTAL DE LA OBRA')).toBe(true);
    expect(esConsultaNumericaDirecta('desvio sin acento')).toBe(true);
  });
});

describe('detectarImportesInventados', () => {
  const tools = ['{"total":15400,"total_fmt":"$ 15.400,00"}'];

  it('acepta los importes que salieron de una tool', () => {
    expect(detectarImportesInventados('El total es $ 15.400,00.', tools)).toBe(false);
  });

  it('marca un importe que no aparece en ningún resultado', () => {
    // El modo de fallo que importa: el modelo emite una cifra plausible que
    // nunca salió de SQLite.
    expect(detectarImportesInventados('El total es $ 99.999,00.', tools)).toBe(true);
  });

  it('ignora números chicos que no son importes', () => {
    expect(detectarImportesInventados('Hay 3 partidas y 12 conceptos.', tools)).toBe(false);
  });

  it('no marca nada cuando el texto no trae cifras', () => {
    expect(detectarImportesInventados('No está en el expediente.', tools)).toBe(false);
  });

  it('compara solo los dígitos, sin importar el formato', () => {
    // "15400" en el JSON de la tool vale para "$ 15.400,00" en la respuesta.
    expect(detectarImportesInventados('Son $15.400', ['{"importe":15400}'])).toBe(false);
  });
});

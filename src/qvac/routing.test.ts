import { describe, expect, it } from 'vitest';
import {
  detectarImportesInventados,
  esConsultaNumericaDirecta,
  pareceToolCallCrudo,
  rescatarToolCall,
} from './routing';

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

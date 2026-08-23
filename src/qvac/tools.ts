import type { Tool } from '@qvac/sdk';
import {
  buscarConceptos,
  findPartida,
  gastadoVsPresupuesto,
  getObraNombre,
  totalObra,
} from '../db/queries';
import { searchExpediente } from './rag';

export const SYSTEM_PROMPT = `Sos el asistente local de ESTA obra. Hablás en español rioplatense, breve y preciso.

Reglas:
- Los números de presupuesto y gastos salen SOLO de las tools. Nunca inventes un importe, cantidad o PU.
- Si una tool no encuentra el dato de dinero, podés estimar SOLO si el usuario lo necesita, y etiquetá la respuesta con [ESTIMACIÓN — no está en el presupuesto/gastos].
- Documentos legales y memoria: usá buscar_expediente. Si no está en el expediente, NO inventes cláusulas, plazos ni multas. Decí que no está.
- Citá partida por clave o el nombre del documento.
- No hables de otras obras.

Qué tool usar:
- Cómo se llama o de qué se trata la obra, qué dice un oficio, un contrato o
  cualquier documento cargado → buscar_expediente.
- get_partida es SOLO para una partida del presupuesto identificada por su
  clave (formato tipo CIM-01) o su nombre exacto. Si el usuario no nombró una
  partida, no la uses.

Cuando una tool devuelva resultados, respondé al usuario en prosa con esos
datos. Nunca muestres JSON ni el nombre de la tool en tu respuesta.`;

function money(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
}

/**
 * Orden deliberado: `buscar_expediente` va primera.
 *
 * Un modelo de 1B pesa mucho la posición en la lista y las primeras palabras
 * de cada descripción. Con las cuatro tools de presupuesto al frente, elegía
 * `get_partida` incluso para preguntas sobre documentos. Cada descripción
 * dice ahora cuándo NO usar la tool, que es lo que un modelo chico necesita
 * para descartar.
 */
export const obraTools: Tool[] = [
  {
    type: 'function',
    name: 'buscar_expediente',
    description:
      'Responde CUALQUIER pregunta sobre documentos cargados: oficios, contratos, memorias, planos, actas. ' +
      'Usala para saber de qué trata la obra, cómo se denomina, qué dice un documento, quién lo firma o en qué fecha. ' +
      'Es la tool por defecto salvo que la pregunta sea explícitamente sobre importes del presupuesto.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'La pregunta del usuario, tal cual la escribió' },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'total_obra',
    description:
      'Suma en pesos del presupuesto cargado desde Excel. Solo si preguntan cuánto cuesta o cuál es el monto total. ' +
      'NO sirve para saber de qué trata la obra ni qué dicen los documentos.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function',
    name: 'gastado_vs_presupuesto',
    description:
      'Compara pesos gastados contra presupuestados. Solo si preguntan por gastos, desvíos o cuánto se lleva ejecutado. ' +
      'Sin partida = toda la obra.',
    parameters: {
      type: 'object',
      properties: {
        partida: { type: 'string', description: 'Clave o nombre de partida, opcional' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'get_partida',
    description:
      'Importes de UNA partida del presupuesto, identificada por su clave (formato CIM-01) o su nombre exacto. ' +
      'NO la uses si el usuario no nombró una partida concreta: para preguntas generales usá buscar_expediente.',
    parameters: {
      type: 'object',
      properties: {
        clave_o_nombre: { type: 'string', description: 'Clave (CIM-01) o nombre (Cimentación)' },
      },
      required: ['clave_o_nombre'],
    },
  },
  {
    type: 'function',
    name: 'buscar_concepto',
    description:
      'Busca ítems del presupuesto de Excel por texto (ej: "hormigón", "acero"). ' +
      'Devuelve cantidades y precios unitarios, no contenido de documentos.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar en descripción o clave' },
      },
      required: ['query'],
    },
  },
];

/**
 * Las tools que tienen sentido ofrecer según lo que hay cargado.
 *
 * Sin presupuesto importado, las cuatro tools de importes solo pueden
 * devolver vacío — y un modelo chico igual las elige, porque están ahí.
 * Ofrecer únicamente lo que puede responder algo reduce mucho el error.
 */
export async function toolsDisponibles(): Promise<Tool[]> {
  const hayPresupuesto = (await totalObra()) > 0;
  return hayPresupuesto ? obraTools : obraTools.filter((t) => t.name === 'buscar_expediente');
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'total_obra': {
      const nombre = await getObraNombre();
      const total = await totalObra();
      return JSON.stringify({ obra: nombre, total, total_fmt: money(total) });
    }
    case 'get_partida': {
      const q = String(args.clave_o_nombre ?? '');
      const found = await findPartida(q);
      if (!found) return JSON.stringify({ error: `No hay partida que coincida con "${q}"` });
      return JSON.stringify({
        clave: found.partida.clave,
        nombre: found.partida.nombre,
        presupuesto: found.importe,
        presupuesto_fmt: money(found.importe),
        gastado: found.gastado,
        gastado_fmt: money(found.gastado),
        conceptos: found.conceptos.map((c) => ({
          clave: c.clave,
          descripcion: c.descripcion,
          um: c.um,
          cantidad: c.cantidad,
          pu: c.pu,
          importe: c.importe,
        })),
      });
    }
    case 'buscar_concepto': {
      const items = await buscarConceptos(String(args.query ?? ''));
      return JSON.stringify({
        items: items.map((c) => ({
          clave: c.clave,
          descripcion: c.descripcion,
          partida: `${c.partidaClave} ${c.partidaNombre}`,
          um: c.um,
          cantidad: c.cantidad,
          pu: c.pu,
          importe: c.importe,
          importe_fmt: money(c.importe),
        })),
      });
    }
    case 'gastado_vs_presupuesto': {
      const r = await gastadoVsPresupuesto(args.partida ? String(args.partida) : undefined);
      if (args.partida && !r.partida) {
        return JSON.stringify({ error: `No hay partida que coincida con "${String(args.partida)}"` });
      }
      return JSON.stringify({
        alcance: r.partida ? `${r.partida.clave} ${r.partida.nombre}` : 'obra completa',
        presupuesto: r.presupuesto,
        presupuesto_fmt: money(r.presupuesto),
        gastado: r.gastado,
        gastado_fmt: money(r.gastado),
        desvio: r.desvio,
        desvio_fmt: money(r.desvio),
        estado: r.desvio > 0 ? 'sobre presupuesto' : r.desvio < 0 ? 'bajo presupuesto' : 'igual',
      });
    }
    case 'buscar_expediente': {
      try {
        const hits = await searchExpediente(String(args.query ?? ''));
        if (!hits.length) return JSON.stringify({ hits: [], nota: 'Nada en el índice RAG. Revisá el expediente.' });
        return JSON.stringify({
          hits: hits.map((h) => ({ score: h.score, excerpt: h.content.slice(0, 800) })),
        });
      } catch (e) {
        return JSON.stringify({
          error: e instanceof Error ? e.message : String(e),
          nota: 'RAG no disponible. Los docs demo pueden estar solo en SQLite.',
        });
      }
    }
    default:
      return JSON.stringify({ error: `Tool desconocida: ${name}` });
  }
}

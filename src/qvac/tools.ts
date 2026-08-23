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
- No hables de otras obras.`;

function money(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
}

export const obraTools: Tool[] = [
  {
    type: 'function',
    name: 'total_obra',
    description: 'Total del presupuesto de la obra (suma de conceptos).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function',
    name: 'get_partida',
    description: 'Detalle de una partida por clave o nombre (importe, gastado, conceptos).',
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
    description: 'Busca conceptos del presupuesto por texto.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar en descripción o clave' },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'gastado_vs_presupuesto',
    description: 'Compara gastado vs presupuesto. Sin partida = toda la obra.',
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
    name: 'buscar_expediente',
    description: 'Busca en el expediente (contrato, memoria de cálculo, legales).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Pregunta o tema (plazos, multas, recubrimiento, etc.)' },
      },
      required: ['query'],
    },
  },
];

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

import { completion } from '@qvac/sdk';
import { findPartida, gastadoVsPresupuesto, getObraNombre, listDocumentosTexto, listPartidas, totalObra } from '../db/queries';
import type { RespuestaFuente } from '../types';
import { ensureLlm, type ProgressHandler } from './models';
import {
  detectarImportesInventados,
  esConsultaNumericaDirecta,
  pareceToolCallCrudo,
  rescatarToolCall,
} from './routing';
import { executeTool, obraTools, SYSTEM_PROMPT, toolsDisponibles } from './tools';

export {
  detectarImportesInventados,
  esConsultaNumericaDirecta,
  pareceToolCallCrudo,
  rescatarToolCall,
} from './routing';

export type HistoryTurn = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string };

export type RespuestaChat = {
  text: string;
  fuente: RespuestaFuente;
  toolCalls: string[];
};

function money(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
}

async function matchPartidaQuery(t: string): Promise<string | undefined> {
  const partidas = await listPartidas();
  const hit = partidas.find(
    (p) => t.includes(p.clave.toLowerCase()) || t.includes(p.nombre.toLowerCase())
  );
  return hit?.clave;
}

export async function tryDeterministicAnswer(userText: string): Promise<string | null> {
  const t = userText.toLowerCase();
  const asksTotal = /total|presupuesto de la obra|monto (total|de la obra)/.test(t);
  const asksPartida = /partida/.test(t);
  const asksGasto = /gastad|desv[ií]o|vs presupuesto|contra presupuesto/.test(t);
  const asksContrato = /contrato|plazo|multa|anticipo|art[ií]culo/.test(t);
  const asksMemoria = /memoria|recubrimiento|hormig[oó]n|cirsoc|losa/.test(t);
  const partidaQ = await matchPartidaQuery(t);

  if (asksGasto) {
    const r = await gastadoVsPresupuesto(partidaQ);
    if (r.presupuesto === 0 && r.gastado === 0 && !r.partida) {
      return 'Todavía no hay presupuesto ni gastos. Importá el Excel en Presupuestos y después los gastos.';
    }
    const scope = r.partida ? `${r.partida.clave} ${r.partida.nombre}` : 'la obra';
    return `En ${scope}: presupuesto ${money(r.presupuesto)}, gastado ${money(r.gastado)}, desvío ${money(r.desvio)} (${r.desvio > 0 ? 'sobre' : r.desvio < 0 ? 'bajo' : 'igual al'} presupuesto). Fuente: SQLite (partidas/gastos).`;
  }

  if (asksTotal || asksPartida || partidaQ) {
    const nombre = await getObraNombre();
    const total = await totalObra();
    if (total === 0) {
      return 'No hay presupuesto cargado. Andá a Presupuestos e importá tu Excel.';
    }
    let extra = '';
    if (partidaQ) {
      const found = await findPartida(partidaQ);
      if (found) {
        extra = ` La partida ${found.partida.clave} ${found.partida.nombre} suma ${money(found.importe)} (${found.conceptos.length} conceptos).`;
      }
    } else if (asksPartida) {
      const partidas = await listPartidas();
      extra = partidas.length
        ? ` Partidas: ${partidas.map((p) => p.clave).join(', ')}.`
        : '';
    }
    return `${nombre}: total presupuesto ${money(total)}.${extra} Fuente: SQLite (conceptos).`;
  }

  if (asksContrato || asksMemoria) {
    const docs = await listDocumentosTexto();
    if (!docs.length) {
      return 'No hay documentos en el expediente. Cargalos en Expediente. No invento cláusulas.';
    }
    const pool = docs.map((d) => `## ${d.nombre}\n${d.texto}`).join('\n\n');
    if (asksContrato) {
      const plazo = pool.match(/plazo[\s\S]{0,200}/i)?.[0];
      const multa = pool.match(/multa[\s\S]{0,220}/i)?.[0];
      if (!plazo && !multa) {
        return 'No está en el expediente una cláusula de plazo o multa. No invento condiciones legales.';
      }
      return [plazo, multa].filter(Boolean).join('\n\n') + '\n\nFuente: expediente (documentos legales).';
    }
    const hit = pool.match(/recubrimiento[\s\S]{0,180}|CIRSOC[\s\S]{0,180}|losa[\s\S]{0,120}/i);
    if (!hit) return 'No encontré ese punto en la memoria de cálculo.';
    return `${hit[0]}\n\nFuente: expediente (memoria de cálculo).`;
  }

  return null;
}

const MAX_ITERACIONES_TOOLS = 3;

async function runLlmTurn(params: {
  history: HistoryTurn[];
  userText: string;
  onDelta: (chunk: string) => void;
  onProgress?: ProgressHandler;
}): Promise<RespuestaChat> {
  const modelId = await ensureLlm(params.onProgress);
  // Solo se ofrecen las tools que pueden responder algo con los datos que hay.
  const tools = await toolsDisponibles();

  const history: HistoryTurn[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...params.history,
    { role: 'user', content: params.userText },
  ];

  const toolCalls: string[] = [];
  const resultadosTools: string[] = [];
  let texto = '';

  for (let i = 0; i < MAX_ITERACIONES_TOOLS; i += 1) {
    const run = completion({
      modelId,
      history,
      stream: true,
      tools,
      // Sin `toolDialect`: el auto-router del SDK reconoce este modelo por
      // nombre y elige el formato correcto. Forzar 'pythonic' hacía que los
      // tool-calls —que este build emite en JSON— se mostraran como texto
      // crudo en el chat en vez de ejecutarse.
    });

    texto = '';
    for await (const ev of run.events) {
      if (ev.type === 'contentDelta') {
        texto += ev.text;
        params.onDelta(texto);
      }
    }

    const final = await run.final;
    texto = final.contentText || texto;

    // Llamadas que el SDK sí reconoció.
    let pendientes = final.toolCalls.map((c) => ({ name: c.name, args: c.arguments }));

    // Y las que emitió con un formato que ningún dialecto parsea: este modelo
    // usa `parameters` donde el SDK espera `arguments`.
    if (pendientes.length === 0 && pareceToolCallCrudo(texto)) {
      const rescatada = rescatarToolCall(
        texto,
        tools.map((t) => t.name)
      );
      if (rescatada) pendientes = [{ name: rescatada.name, args: rescatada.args }];
    }

    if (pendientes.length === 0) {
      break;
    }

    // El modelo pidió datos: se ejecutan contra SQLite y se reinyectan.
    history.push({ role: 'assistant', content: final.raw.fullText || texto });
    for (const call of pendientes) {
      toolCalls.push(call.name);
      const resultado = await executeTool(call.name, call.args);
      resultadosTools.push(resultado);
      history.push({ role: 'tool', content: resultado });
    }
  }

  // El modelo pidió una tool pero ni el SDK ni el rescate la reconocieron.
  // Antes de rendirse: si la pregunta era sobre documentos, se busca en el
  // expediente igual. El modelo ya había decidido que ahí estaba la respuesta.
  if (pareceToolCallCrudo(texto)) {
    if (resultadosTools.length === 0) {
      const delExpediente = await executeTool('buscar_expediente', { query: params.userText });
      const hits = JSON.parse(delExpediente) as { hits?: { excerpt: string }[] };
      if (hits.hits?.length) {
        return {
          text: hits.hits.map((h) => h.excerpt).join('\n\n---\n\n'),
          fuente: 'llm',
          toolCalls: ['buscar_expediente'],
        };
      }
    }
    const respaldo = await tryDeterministicAnswer(params.userText);
    return {
      text: respaldo ?? 'No encontré esa información en el expediente ni en el presupuesto cargado.',
      fuente: 'sql',
      toolCalls,
    };
  }

  if (resultadosTools.length > 0 && detectarImportesInventados(texto, resultadosTools)) {
    texto += '\n\n⚠️ Verificá los importes: puede haber cifras que no salieron del presupuesto.';
  }

  return { text: texto.trim(), fuente: 'llm', toolCalls };
}

export async function runChatTurn(params: {
  history: HistoryTurn[];
  userText: string;
  onDelta: (chunk: string) => void;
  onProgress?: ProgressHandler;
}): Promise<RespuestaChat> {
  // Las cifras exactas salen de SQL, no del modelo.
  if (esConsultaNumericaDirecta(params.userText)) {
    const directa = await tryDeterministicAnswer(params.userText);
    if (directa) return { text: directa, fuente: 'sql', toolCalls: [] };
  }

  try {
    return await runLlmTurn(params);
  } catch (e) {
    // El LLM no está disponible (sin descargar, sin memoria, worker caído):
    // se intenta responder igual con lo que SQLite puede afirmar.
    const respaldo = await tryDeterministicAnswer(params.userText);
    if (respaldo) return { text: respaldo, fuente: 'sql', toolCalls: [] };
    const motivo = e instanceof Error ? e.message : String(e);
    return {
      text: `El asistente no está disponible (${motivo}). Puedo responder por el total de la obra, una partida o gastado vs presupuesto.`,
      fuente: 'sql',
      toolCalls: [],
    };
  }
}

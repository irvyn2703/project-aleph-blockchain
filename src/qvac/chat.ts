import { completion } from '@qvac/sdk';
import { CONTRATO_DEMO, MEMORIA_DEMO } from '../db/seed';
import { findPartida, gastadoVsPresupuesto, getObraNombre, listDocumentosTexto, totalObra } from '../db/queries';
import { ensureLlm, getLoaded } from './models';
import { executeTool, obraTools, SYSTEM_PROMPT } from './tools';

export type HistoryTurn = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string };

function money(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
}

/** Respuestas determinísticas para el guion del demo si el LLM no está o no llama tools. */
export async function tryDeterministicAnswer(userText: string): Promise<string | null> {
  const t = userText.toLowerCase();
  const asksTotal = /total|presupuesto de la obra|monto (total|de la obra)/.test(t);
  const asksPartida = /partida|cimentaci[oó]n|estructura|cim-01|est-01/.test(t);
  const asksGasto = /gastad|desv[ií]o|vs presupuesto|contra presupuesto/.test(t);
  const asksContrato = /contrato|plazo|multa|anticipo|art[ií]culo/.test(t);
  const asksMemoria = /memoria|recubrimiento|hormig[oó]n|cirsoc|losa/.test(t);

  if (asksGasto) {
    const q = t.includes('ciment') || t.includes('cim') ? 'CIM-01' : t.includes('estruct') || t.includes('est') ? 'EST-01' : undefined;
    const r = await gastadoVsPresupuesto(q);
    const scope = r.partida ? `${r.partida.clave} ${r.partida.nombre}` : 'la obra';
    return `En ${scope}: presupuesto ${money(r.presupuesto)}, gastado ${money(r.gastado)}, desvío ${money(r.desvio)} (${r.desvio > 0 ? 'sobre' : r.desvio < 0 ? 'bajo' : 'igual al'} presupuesto). Fuente: SQLite (partidas/gastos).`;
  }

  if (asksTotal || asksPartida) {
    const nombre = await getObraNombre();
    const total = await totalObra();
    let extra = '';
    const found = await findPartida(
      t.includes('ciment') || t.includes('cim') ? 'CIM-01' : t.includes('estruct') || t.includes('est') ? 'EST-01' : 'CIM-01'
    );
    if (found && (asksPartida || asksTotal)) {
      extra = ` La partida ${found.partida.clave} ${found.partida.nombre} suma ${money(found.importe)} (${found.conceptos.length} conceptos).`;
    }
    return `${nombre}: total presupuesto ${money(total)}.${extra} Fuente: SQLite (conceptos).`;
  }

  if (asksContrato || asksMemoria) {
    const docs = await listDocumentosTexto();
    const pool = docs.length
      ? docs.map((d) => `## ${d.nombre}\n${d.texto}`).join('\n\n')
      : `${CONTRATO_DEMO}\n\n${MEMORIA_DEMO}`;
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

export async function runChatTurn(params: {
  history: HistoryTurn[];
  userText: string;
  onDelta: (chunk: string) => void;
}): Promise<string> {
  const deterministic = await tryDeterministicAnswer(params.userText);
  const llmId = getLoaded().llm ?? (await ensureLlm().catch(() => null));

  if (!llmId) {
    return deterministic ?? 'El modelo local todavía no está listo. En un teléfono Android físico corre: npx expo run:android --device.';
  }

  const history: HistoryTurn[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...params.history.filter((h) => h.role !== 'system'),
    { role: 'user', content: params.userText },
  ];

  const first = completion({
    modelId: llmId,
    history,
    stream: true,
    tools: obraTools,
  });

  let acc = '';
  for await (const token of first.tokenStream) {
    acc += token;
    params.onDelta(acc);
  }

  const toolCalls = await first.toolCalls;
  if (!toolCalls.length) {
    if (deterministic && acc.trim().length < 20) return deterministic;
    return acc.trim() || deterministic || 'No pude generar respuesta.';
  }

  const toolLines: string[] = [];
  history.push({ role: 'assistant', content: (await first.text) || acc });
  for (const call of toolCalls) {
    const result = await executeTool(call.name, call.arguments as Record<string, unknown>);
    toolLines.push(`${call.name}: ${result}`);
    history.push({ role: 'tool', content: result });
  }

  params.onDelta(acc + '\n');
  const follow = completion({
    modelId: llmId,
    history,
    stream: true,
    tools: obraTools,
  });
  let followAcc = '';
  for await (const token of follow.tokenStream) {
    followAcc += token;
    params.onDelta(followAcc);
  }

  const out = followAcc.trim() || acc.trim();
  if (!out && deterministic) return deterministic;
  if (deterministic && !/CIM-01|ARS|\$|artículo|plazo/i.test(out)) {
    return `${out}\n\n${deterministic}`;
  }
  return out || toolLines.join('\n');
}

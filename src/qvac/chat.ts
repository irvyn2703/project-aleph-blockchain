import { findPartida, gastadoVsPresupuesto, getObraNombre, listDocumentosTexto, listPartidas, totalObra } from '../db/queries';

export type HistoryTurn = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string };

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

export async function runChatTurn(params: {
  history: HistoryTurn[];
  userText: string;
  onDelta: (chunk: string) => void;
}): Promise<string> {
  const deterministic = await tryDeterministicAnswer(params.userText);
  if (deterministic) return deterministic;
  return 'Preguntá por el total, una partida (por clave o nombre), el contrato o gastado vs presupuesto.';
}

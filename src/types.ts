export type ScreenName = 'home' | 'presupuestos' | 'gastos' | 'expediente' | 'assistant';

export type DocumentoTipo = 'legal' | 'memoria' | 'plano';

export type Partida = {
  id: number;
  clave: string;
  nombre: string;
};

export type Concepto = {
  id: number;
  partidaId: number;
  clave: string;
  descripcion: string;
  um: string;
  cantidad: number;
  pu: number;
  importe: number;
};

export type PartidaConConceptos = Partida & {
  conceptos: Concepto[];
  importe: number;
};

export type Gasto = {
  id: number;
  partidaId: number;
  monto: number;
  descripcion: string;
  rutaComprobante: string | null;
  fecha: string;
  ocrRaw: string | null;
};

export type Documento = {
  id: number;
  ruta: string;
  fechaSubida: string;
  tipo: DocumentoTipo;
  nombre: string;
  metadata: string | null;
  ragStatus: 'pendiente' | 'listo' | 'error';
};

export type ChatRole = 'user' | 'assistant' | 'system';

/** De dónde salió una respuesta del asistente: consulta SQL directa o el LLM. */
export type RespuestaFuente = 'sql' | 'llm';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  estimate?: boolean;
  fuente?: RespuestaFuente;
  /** Tools que el LLM ejecutó para responder, para mostrar procedencia. */
  toolCalls?: string[];
};

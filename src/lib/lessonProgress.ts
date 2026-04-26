/**
 * Persistência local do progresso de cada dia da lição.
 * - Status por dia: "in_progress" | "done"
 * - Último passo visitado por dia (para retomar exatamente onde parou)
 *
 * Funciona offline (localStorage). Não exige login. Caso o usuário ative
 * Lovable Cloud no futuro, basta sincronizar este shape com uma tabela.
 */
const KEY = "lumen:lesson-progress";
const SCHEMA = 1;

export type LessonStatus = "in_progress" | "done";

export interface LessonProgressEntry {
  day: number;
  status: LessonStatus;
  step: number;          // último índice de passo visitado (0-based)
  totalSteps: number;    // útil para mostrar "3/9"
  updatedAt: string;     // ISO
  completedAt?: string;  // ISO, quando status = "done"
}

interface ProgressFile {
  v: number;
  entries: Record<string, LessonProgressEntry>;
}

function read(): ProgressFile {
  if (typeof window === "undefined") return { v: SCHEMA, entries: {} };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { v: SCHEMA, entries: {} };
    const parsed = JSON.parse(raw) as ProgressFile;
    if (!parsed || typeof parsed !== "object" || !parsed.entries) {
      return { v: SCHEMA, entries: {} };
    }
    return parsed;
  } catch {
    return { v: SCHEMA, entries: {} };
  }
}

function write(file: ProgressFile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(file));
  } catch {
    /* quota / privacy mode — ignore */
  }
}

export function getLessonProgress(day: number): LessonProgressEntry | null {
  return read().entries[String(day)] ?? null;
}

export function getAllProgress(): Record<string, LessonProgressEntry> {
  return read().entries;
}

/** Atualiza o passo atual da lição. Mantém status "in_progress" enquanto não concluir. */
export function saveLessonStep(day: number, step: number, totalSteps: number) {
  const file = read();
  const prev = file.entries[String(day)];
  // Se já estiver concluída, ainda assim guardamos o último ponto de revisão,
  // mas não rebaixamos o status para "in_progress".
  const status: LessonStatus = prev?.status === "done" ? "done" : "in_progress";
  file.entries[String(day)] = {
    day,
    status,
    step: Math.max(0, step),
    totalSteps: Math.max(1, totalSteps),
    updatedAt: new Date().toISOString(),
    completedAt: prev?.completedAt,
  };
  write(file);
}

/** Marca o dia como concluído e zera o cursor para que uma revisão comece do início. */
export function markLessonDone(day: number, totalSteps: number) {
  const file = read();
  const now = new Date().toISOString();
  const prev = file.entries[String(day)];
  file.entries[String(day)] = {
    day,
    status: "done",
    step: 0,
    totalSteps: Math.max(1, totalSteps),
    updatedAt: now,
    completedAt: prev?.completedAt ?? now,
  };
  write(file);
}

/** Reinicia o cursor (usado quando o usuário pede "começar do zero"). */
export function resetLessonProgress(day: number) {
  const file = read();
  delete file.entries[String(day)];
  write(file);
}

/** Retorna o dia "atual" — primeiro dia sem status "done", começando em `start`. */
export function findCurrentDay(start = 1, max = 365): number {
  const all = read().entries;
  for (let d = start; d <= max; d++) {
    if (all[String(d)]?.status !== "done") return d;
  }
  return max;
}
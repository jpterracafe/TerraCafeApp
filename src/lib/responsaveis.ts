// ── Helpers compartilhados para o campo de responsáveis ─────────────────────────
// O campo "responsavel" das fases/logs aceita uma lista separada por vírgula,
// com emails e/ou nomes (ex: "thiago@email.com,Arthur Silva").

// Normaliza texto: remove acentos e caixa baixa (ex: "Elétrica" -> "eletrica")
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Divide a lista de responsáveis, ignorando partes vazias
export function parseResponsavelEmails(responsavel?: string): string[] {
  if (!responsavel) return [];
  return responsavel.split(",").map(part => part.trim()).filter(Boolean);
}

// Indica se o campo de responsável (ainda) não foi atribuído a ninguém.
// Cobre variações com/sem acento e caixa: "Não atribuído", "Nao atribuido",
// "Não Definido", "sem responsável", etc.
export function isResponsavelVazio(responsavel?: string | null): boolean {
  if (!responsavel) return true;
  const v = normalizeName(responsavel);
  if (!v) return true;
  return vaziosResponsavel.has(v);
}

const vaziosResponsavel = new Set([
  "nao atribuido",
  "nao definido",
  "sem responsavel",
  "sem",
  "sistema",
]);

// Termos genéricos que não representam pessoas reais e não devem aparecer
// como responsáveis na UI (ex: "Equipe", "Administrador", "Não atribuído")
export const TERMOS_GENERICOS_RESPONSAVEL = new Set([
  "equipe",
  "equipe tecnica",
  "equipe de campo",
  "equipe geral",
  "administrador",
  "admin",
  "nao atribuido",
  "nao definido",
  "sem responsavel",
  "sem",
  "sistema",
]);
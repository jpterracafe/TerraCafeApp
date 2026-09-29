/**
 * Utilitários de data locais para evitar o bug de fuso horário UTC (GMT+0).
 * 
 * No Brasil (UTC-3), chamadas puras como `new Date().toISOString().split('T')[0]`
 * retornam o dia de AMANHÃ entre 21:00 e 23:59:59.
 * 
 * Esta função garante que o dia corrente seja sempre o dia local real.
 */
export function getLocalISODate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

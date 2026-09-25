/**
 * Utilitário para exportar dados para CSV compatível com Microsoft Excel (UTF-8 BOM).
 */
export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  if (typeof window === 'undefined') return;

  const escapeCSV = (val: string | number | undefined | null) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerLine = headers.map(escapeCSV).join(';');
  const contentLines = rows.map((row) => row.map(escapeCSV).join(';'));
  const csvContent = [headerLine, ...contentLines].join('\r\n');

  // Adiciona BOM (\uFEFF) para garantir que o Excel no Windows/Mac abra acentos em português corretamente
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

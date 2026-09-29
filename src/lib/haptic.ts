/**
 * Micro-vibração tátil silenciosa para aparelhos móveis (smartphones/tablets).
 * 
 * - Ajuda o operador no campo sob luz solar forte a ter confirmação física
 *   instantânea de toques e ações importantes sem precisar olhar fixamente.
 * - Totalmente silencioso: sem avisos, sem notificações e sem erros se o aparelho
 *   ou navegador não suportar a API de vibração.
 */
export function triggerHaptic(type: 'tap' | 'light' | 'success' | 'warning' = 'tap') {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('vibrate' in navigator)) {
    return;
  }

  try {
    switch (type) {
      case 'tap':
      case 'light':
        navigator.vibrate(12);
        break;
      case 'success':
        navigator.vibrate([15, 40, 20]);
        break;
      case 'warning':
        navigator.vibrate([25, 40, 25]);
        break;
      default:
        navigator.vibrate(10);
    }
  } catch {
    // Falha silenciosa em navegadores com restrições de permissão
  }
}

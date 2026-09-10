export function extractUsernameFromEmail(email: string): string {
  if (!email) return 'Usuário';
  const lower = email.toLowerCase().trim();
  const beforeAt = lower.split('@')[0];
  if (!beforeAt) return 'Usuário';

  // Divide por ponto, underline ou hífen e capitaliza cada palavra
  return beforeAt
    .split(/[._-]/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ') || beforeAt;
}

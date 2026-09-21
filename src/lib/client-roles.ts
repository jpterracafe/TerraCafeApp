/**
 * Regras de acesso master compartilhadas entre componentes CLIENT.
 * Client-safe: NÃO importa @/lib/env (variáveis de servidor dariam
 * `undefined` no browser e esconderiam links de quem tem direito).
 *
 * Mantém exatamente a mesma regra usada nas páginas admin:
 * role "Desenvolvedor" OU o e-mail do administrador principal.
 */
export const ADMIN_MASTER_EMAIL = "joao2005souza@gmail.com";

export function isMasterDevSession(session: {
  user?: { email?: string | null; role?: string } | null;
} | null): boolean {
  if (!session?.user) return false;
  const { role, email } = session.user;
  return role === "Desenvolvedor" || email === ADMIN_MASTER_EMAIL;
}

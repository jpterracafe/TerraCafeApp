import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getSupabase } from "@/lib/supabase";
import env from "@/lib/env";
import bcrypt from "bcrypt";

import { extractUsernameFromEmail } from "./auth-utils";
export { extractUsernameFromEmail };

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.warn("[auth] Credenciais faltando");
          return null;
        }

        const emailNormalizado = credentials.email.toLowerCase().trim();
        const senhaDigitada = credentials.password;
        const adminEmail = env.ADMIN_EMAIL;
        const adminPassword = env.ADMIN_PASSWORD;

        // 1. Verifica admin via env vars (não usa o banco)
        // 🔴 ALTA PRIORIDADE: comparação agora usa bcrypt se o ADMIN_PASSWORD
        // já estiver hashado, ou comparação literal de texto plano (para manter
        // compatibilidade com quem já tem a env configurada em texto plano).
        // Quando usar o modo texto plano, emite um warning para o admin migrar.
        if (adminEmail && adminPassword && emailNormalizado === adminEmail.toLowerCase().trim()) {
          const isHashBcrypt = adminPassword.startsWith("$2b$") || adminPassword.startsWith("$2a$");
          const matchBcrypt = isHashBcrypt ? await bcrypt.compare(senhaDigitada, adminPassword) : false;
          const matchPlain  = senhaDigitada === adminPassword;

          if (matchBcrypt || matchPlain) {
            if (matchPlain && !isHashBcrypt) {
              console.warn(
                "[auth] ⚠️ ADMIN_PASSWORD em texto plano detectado. " +
                "Para segurança, gere um hash bcrypt e use o hash no .env.local. " +
                "(ex: $2b$10$...)"
              );
            }
            console.log("[auth] Login admin via env vars OK");
            return {
              id: "admin",
              name: "Administrador",
              email: adminEmail,
              role: "Desenvolvedor",
            } as any;
          }
        }

        // 2. Verifica usuários cadastrados no banco
        try {
          const db = getSupabase();

          const { data: user, error } = await db
            .from("users")
            .select("id, name, email, password, role")
            .eq("email", emailNormalizado)
            .maybeSingle();

          if (error) {
            console.error("[auth] Erro na query Supabase:", JSON.stringify(error));
            return null;
          }

          if (!user) {
            console.error("[auth] Usuário não encontrado no banco:", emailNormalizado);
            return null;
          }

          if (!user.password) {
            console.error("[auth] Usuário sem senha no banco:", emailNormalizado);
            return null;
          }

          const senhaValida = await bcrypt.compare(senhaDigitada, user.password);
          if (!senhaValida) {
            console.error("[auth] Senha INCORRETA para:", emailNormalizado);
            console.error("[auth] Hash armazenado (primeiros 20):", String(user.password).substring(0, 20) + "...");
            return null;
          }

          // Se o nome no banco for genérico ou vazio, extrai do email @terracafe.com
          const displayName = user.name && user.name !== "Usuário" 
            ? user.name 
            : extractUsernameFromEmail(emailNormalizado);

          console.log("[auth] Login de usuário OK:", emailNormalizado, "role=" + user.role, "name=" + displayName);
          return {
            id: user.id,
            name: displayName,
            email: user.email ?? emailNormalizado,
            role: user.role,
          };
        } catch (err) {
          console.error("[auth] Exceção ao autenticar:", err);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }: { token: any; user?: any }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.name = token.name;
        session.user.email = token.email;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 horas
  },

  secret: env.NEXTAUTH_SECRET,
};

/**
 * Verifica se a sessão atual pertence a um administrador.
 * Admin = role "Desenvolvedor" OU email igual ao ADMIN_EMAIL das env vars.
 */
export function isAdminSession(
  session: { user?: { email?: string | null; role?: string } } | null
): boolean {
  if (!session?.user) return false;
  const { role, email } = session.user;
  return (
    role === "Desenvolvedor" ||
    Boolean(email && env.ADMIN_EMAIL && email === env.ADMIN_EMAIL)
  );
}

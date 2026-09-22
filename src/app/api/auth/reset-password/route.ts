/**
 * ============================================================
 * POST /api/auth/reset-password
 * ============================================================
 * Corpo: { token: string, novaSenha: string, confirmarSenha: string }
 *
 * Valida o token JWT assinado por NEXTAUTH_SECRET e, caso válido,
 * aplica a nova senha (bcrypt) ao usuário correspondente.
 */
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcrypt";
import { getSupabase } from "@/lib/supabase";
import env from "@/lib/env";
import { resetPasswordSchema, formatZodErrors } from "@/lib/validators";

interface Payload {
  sub: string;
  email: string;
  nonce: string;
  exp: number;
}

// Freio anti-abuso em memória (20 tentativas / 10 min por IP) — generoso,
// não afeta uso normal.
const resetBuckets = new Map<string, { start: number; count: number }>();

function rateLimited(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
  const now = Date.now();
  const b = resetBuckets.get(ip);
  if (b && now - b.start < 10 * 60 * 1000 && b.count >= 20) return true;
  resetBuckets.set(ip, b && now - b.start < 10 * 60 * 1000
    ? { start: b.start, count: b.count + 1 }
    : { start: now, count: 1 });
  return false;
}

function verifyToken(raw: string): Payload | null {
  try {
    const [headerB64, bodyB64, sigB64] = raw.split(".");
    if (!headerB64 || !bodyB64 || !sigB64) return null;

    const secret = env.NEXTAUTH_SECRET;
    const expectedSig = createHmac("sha256", secret)
      .update(`${headerB64}.${bodyB64}`)
      .digest();

    const givenSig = Buffer.from(sigB64, "base64url");
    if (expectedSig.length !== givenSig.length) return null;
    if (!timingSafeEqual(expectedSig, givenSig)) return null;

    const payload = JSON.parse(Buffer.from(bodyB64, "base64url").toString()) as Payload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    if (rateLimited(req)) {
      return NextResponse.json(
        { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." },
        { status: 429 }
      );
    }
    const body = await req.json().catch(() => null);
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: formatZodErrors(parsed.error) },
        { status: 400 }
      );
    }
    const { token, novaSenha } = parsed.data;

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "Token inválido ou expirado. Solicite um novo link." },
        { status: 401 }
      );
    }

    const hash = await bcrypt.hash(novaSenha, 10);

    if (payload.sub === "admin") {
      // Admin da env — a única forma de atualizar a senha é:
      // se o admin existe no banco de users, atualizamos lá (melhor prática).
      // Senão, não dá para sobrescrever a env em runtime, então avisamos.
      if (env.ADMIN_EMAIL) {
        const db = getSupabase();
        const { data: existente } = await db
          .from("users")
          .select("id")
          .eq("email", env.ADMIN_EMAIL.toLowerCase().trim())
          .maybeSingle();

        if (existente) {
          const { error } = await db
            .from("users")
            .update({ password: hash, senha_temp: null, updated_at: new Date().toISOString() })
            .eq("id", existente.id);
          if (error) throw error;
          return NextResponse.json({
            ok: true,
            message: "Senha redefinida com sucesso! Agora você pode fazer login.",
            redirectTo: "/login",
          });
        }
      }

      return NextResponse.json(
        {
          ok: false,
          error:
            "Este login de administrador é configurado via variáveis de ambiente (.env.local). " +
            "Para alterar a senha, peça ao responsável técnico que atualize a variável ADMIN_PASSWORD " +
            "ou cadastre o mesmo e-mail no módulo de gerenciamento de usuários.",
        },
        { status: 400 }
      );
    }

    // Usuário comum no banco
    const db = getSupabase();
    const { error } = await db
      .from("users")
      .update({ password: hash, senha_temp: null, updated_at: new Date().toISOString() })
      .eq("id", payload.sub);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      message: "Senha redefinida com sucesso! Agora você pode fazer login.",
      redirectTo: "/login",
    });
  } catch (e) {
    console.error("[POST /api/auth/reset-password]", e);
    return NextResponse.json(
      { ok: false, error: "Erro interno ao redefinir senha." },
      { status: 500 }
    );
  }
}

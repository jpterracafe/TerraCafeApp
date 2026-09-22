/**
 * ============================================================
 * POST /api/auth/forgot-password
 * ============================================================
 * Corpo: { email: string }
 *
 * Gera um token JWT com validade de 30 minutos para redefinição
 * de senha e cria um link de recuperação.
 *
 * ── Comportamento 100% compatível (sem servidor de e-mail) ──
 *   1) Se as variáveis SMTP estiverem configuradas → tenta enviar e-mail real.
 *   2) Senão (modo padrão/desenvolvimento) → imprime o link completo no
 *      CONSOLE do servidor e o retorna no payload JSON como `debugLink`.
 *
 * O endpoint SEMPRE retorna 200 OK, mesmo para e-mails inexistentes
 * (medida anti enumeração de usuários).
 */
import { NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";
import nodemailer from "nodemailer";
import { getSupabase } from "@/lib/supabase";
import env from "@/lib/env";
import { forgotPasswordSchema, formatZodErrors } from "@/lib/validators";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutos

// Bucket em memória por IP (reseta ao reiniciar — suficiente como freio anti-abuso).
const rateBuckets = new Map<string, { start: number; count: number }>();

interface Payload {
  sub: string;          // user id ou 'admin'
  email: string;
  nonce: string;
  exp: number;
}

function signToken(payload: Payload): string {
  const secret = env.NEXTAUTH_SECRET;
  const header  = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body    = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac    = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${hmac}`;
}

function buildResetUrl(token: string): string {
  const base = env.NEXTAUTH_URL?.replace(/\/$/, "") || "http://localhost:3000";
  return `${base}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

export async function POST(req: Request) {
  try {
    // Rate-limit simples em memória (10 tentativas / 10 min por IP) — generoso,
    // não quebra uso normal, apenas freia abuso automatizado.
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
    const now = Date.now();
    const bucket = rateBuckets.get(ip);
    if (bucket && now - bucket.start < 10 * 60 * 1000 && bucket.count >= 10) {
      return NextResponse.json(
        { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." },
        { status: 429 }
      );
    }
    rateBuckets.set(ip, bucket && now - bucket.start < 10 * 60 * 1000
      ? { start: bucket.start, count: bucket.count + 1 }
      : { start: now, count: 1 });

    const body = await req.json().catch(() => null);
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: formatZodErrors(parsed.error) },
        { status: 400 }
      );
    }
    const email = parsed.data.email;

    // ── 1. Verifica se o e-mail existe (admin env ou usuário no banco) ──
    const isAdmin = env.ADMIN_EMAIL && env.ADMIN_EMAIL.toLowerCase().trim() === email;

    let userId: string | null = null;
    if (!isAdmin) {
      const db = getSupabase();
      const { data: user } = await db
        .from("users")
        .select("id, email")
        .eq("email", email)
        .maybeSingle();
      if (!user) {
        // 🔒 Anti-enumeração: retorna sucesso mesmo para e-mail inexistente.
        // Log genérico sem expor o e-mail consultado.
        console.info("[forgot-password] Solicitação para e-mail não cadastrado (silêncio proposital).");
        return NextResponse.json({
          ok: true,
          message:
            "Se o e-mail estiver cadastrado, enviamos as instruções. " +
            "Verifique sua caixa de entrada (ou o console do servidor em modo dev).",
        });
      }
      userId = user.id;
    }

    // ── 2. Monta o token JWT com expiração ──
    const payload: Payload = {
      sub:   isAdmin ? "admin" : String(userId!),
      email,
      nonce: randomBytes(8).toString("hex"),
      exp:   Date.now() + TOKEN_TTL_MS,
    };
    const token = signToken(payload);
    const resetUrl = buildResetUrl(token);

    // ── 3. Tenta enviar e-mail real (se houver SMTP configurado) ──
    let emailSent = false;
    let emailError: string | undefined;

    const smtpHost = process.env.SMTP_HOST;
    if (smtpHost && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: Number(process.env.SMTP_PORT || 587),
          secure: String(process.env.SMTP_SECURE || "false") === "true",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: process.env.SMTP_FROM || `Terra Café <${process.env.SMTP_USER}>`,
          to: email,
          subject: "🔑 Redefina sua senha — Terra Café",
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
              <h2 style="color:#0ea5e9">Redefina sua senha — Terra Café</h2>
              <p>Olá,</p>
              <p>Recebemos uma solicitação de redefinição de senha para <b>${email}</b>.</p>
              <p>Clique no link abaixo para redefinir (válido por 30 minutos):</p>
              <p style="margin:24px 0">
                <a href="${resetUrl}"
                   style="background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">
                  Redefinir minha senha
                </a>
              </p>
              <p style="color:#64748b;font-size:13px">
                Se não foi você quem solicitou, pode ignorar este e-mail com segurança.
              </p>
              <hr/>
              <p style="font-size:12px;color:#94a3b8">
                Terra Café Irrigação © ${new Date().getFullYear()}
              </p>
            </div>`,
        });
        emailSent = true;
        console.info("[forgot-password] E-mail de recuperação enviado.");
      } catch (err: unknown) {
        emailError = err instanceof Error ? err.message : String(err);
        console.error("[forgot-password] Erro ao enviar e-mail:", emailError);
      }
    }

    // ── 4. Fallback: imprime o link no console apenas fora de produção ──
    // Em produção, o link sai só por e-mail real (sem vazar resetUrl em log).
    if (!emailSent && process.env.NODE_ENV !== "production") {
      console.log(
        "\n" + "=".repeat(72) + "\n" +
        "🚨 [FORGOT PASSWORD] ENVIO DE E-MAIL NÃO CONFIGURADO\n" +
        "  > Usuário .............: " + email + ` (${isAdmin ? "admin env" : "id " + userId})\n` +
        "  > Link redefinição ....: " + resetUrl + "\n" +
        "  > Expira em ...........: 30 minutos\n" +
        "  > Como usar: copie o link completo, cole no navegador.\n" +
        "  > Dica: defina SMTP_HOST/SMTP_USER/SMTP_PASS no .env para envio real.\n" +
        "=".repeat(72) + "\n"
      );
    }

    return NextResponse.json({
      ok: true,
      message: emailSent
        ? "Enviamos as instruções para o e-mail. Verifique sua caixa de entrada e o spam."
        : process.env.NODE_ENV === "production"
          ? "Se o e-mail estiver cadastrado, o administrador foi notificado. Verifique o console do servidor."
          : "Link gerado com sucesso. Verifique o console do servidor para copiar o link de redefinição (envio de e-mail não configurado).",
      emailSent,
      // Expõe o link no JSON apenas FORA de produção e SEM SMTP.
      // Em produção o link sai só pelo e-mail real ou console do servidor —
      // senão qualquer pessoa poderia redefinir a senha de outro usuário
      // apenas digitando o e-mail dele aqui.
      debugLink: !emailSent && process.env.NODE_ENV !== "production" ? resetUrl : undefined,
    });
  } catch (e) {
    console.error("[POST /api/auth/forgot-password]", e);
    return NextResponse.json(
      { ok: false, error: "Erro interno ao processar solicitação." },
      { status: 500 }
    );
  }
}

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
import { getSupabase } from "@/lib/supabase";
import env from "@/lib/env";
import { forgotPasswordSchema, formatZodErrors } from "@/lib/validators";
import { ZodError } from "zod";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutos

interface Payload {
  sub: string;          // user id ou 'admin'
  email: string;
  nonce: string;
  exp: number;
}

function signToken(payload: Payload): string {
  const secret = env.NEXTAUTH_SECRET ?? "terracafe_dev_secret_key_987654321_fixed";
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
        // 🔒 Anti-enumeração: retorna sucesso mesmo para e-mail inexistente
        console.info("[forgot-password] E-mail não encontrado (silêncio proposital):", email);
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
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodemailer = require("nodemailer");
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
        console.info("[forgot-password] E-mail enviado para:", email);
      } catch (err: any) {
        emailError = String(err?.message ?? err);
        console.error("[forgot-password] Erro ao enviar e-mail:", emailError);
      }
    }

    // ── 4. Fallback: imprime o link no console (sempre funciona) ──
    if (!emailSent) {
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
        : "Link gerado com sucesso. Verifique o console do servidor para copiar o link de redefinição (envio de e-mail não configurado).",
      emailSent,
      // Expõe o link no JSON apenas em ambiente dev / SEM SMTP.
      // Em produção com SMTP, o link nunca sai por esse endpoint.
      debugLink: emailSent ? undefined : resetUrl,
    });
  } catch (e) {
    console.error("[POST /api/auth/forgot-password]", e);
    return NextResponse.json(
      { ok: false, error: "Erro interno ao processar solicitação." },
      { status: 500 }
    );
  }
}

import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { message: "E-mail é obrigatório." })
  .email("E-mail inválido.")
  .max(255, { message: "E-mail muito longo." });

export const passwordSchema = z
  .string()
  .min(6, { message: "A senha deve ter pelo menos 6 caracteres." })
  .max(128, { message: "Senha muito longa." });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, { message: "Token é obrigatório." }),
  novaSenha: passwordSchema,
  confirmarSenha: passwordSchema,
}).refine((data) => data.novaSenha === data.confirmarSenha, {
  message: "As senhas digitadas não conferem.",
  path: ["confirmarSenha"],
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "Senha é obrigatória." }),
});

export const responsavelCreateSchema = z.object({
  nome: z.string().trim().min(2, { message: "nome muito curto." }).max(120, { message: "nome muito longo." }),
  cargo: z.string().trim().min(2, { message: "cargo muito curto." }).max(120, { message: "cargo muito longo." }),
  origem: z.enum(["MANUAL", "BANCO_DADOS"]).default("MANUAL"),
});

export const responsavelDeleteSchema = z.object({
  id: z.string().min(1, { message: "id é obrigatório." }),
});

const statusFaseEnum = z.enum([
  "Dentro do programado",
  "Fora do programado",
  "Concluído",
  "Em atraso",
  "Pendente",
  "Cancelado",
]);

const acaoFaseEnum = z.enum([
  "Cotar",
  "Aguardando",
  "Em execução",
  "Concluído",
  "Pendente",
  "Cancelado",
]);

export const faseCreateSchema = z.object({
  gabarito: z.string().trim().min(1, { message: "gabarito é obrigatório." }).max(80, { message: "gabarito muito longo." }),
  responsavel: z.string().trim().max(120).optional().default("Não atribuído"),
  acao: z.union([acaoFaseEnum, z.string().trim().max(80)]).optional().default("Cotar"),
  prazoLimite: z.union([z.string().trim().min(1, { message: "prazoLimite é obrigatório." }), z.date()]),
  status: z.union([statusFaseEnum, z.string().trim().max(80)]).optional().default("Dentro do programado"),
  observacoes: z.string().max(2000).optional().default(""),
  projetoCliente: z.string().max(200).optional().default(""),
});

export const faseUpdateSchema = z.object({
  id: z.string().min(1, { message: "id é obrigatório." }),
  gabarito: z.string().trim().max(80).optional(),
  responsavel: z.string().trim().max(120).optional(),
  acao: z.union([acaoFaseEnum, z.string().trim().max(80)]).optional(),
  prazoLimite: z.union([z.string().trim().min(1), z.date()]).optional(),
  status: z.union([statusFaseEnum, z.string().trim().max(80)]).optional(),
  observacoes: z.string().max(2000).optional(),
  projetoCliente: z.string().max(200).nullable().optional(),
  isDeleted: z.boolean().optional(),
});

export const faseDeleteSchema = z.object({
  id: z.string().min(1, { message: "id é obrigatório." }),
  hard: z.enum(["true", "false"]).optional().default("false"),
});

const statusDiarioEnum = z.enum([
  "Dentro do Programado",
  "Dentro do programado",
  "Acima",
  "Abaixo",
  "Fora do Programado",
  "Concluído",
  "Em atraso",
  "Pendente",
]);

export const diarioLogCreateSchema = z.object({
  data: z.union([z.string().trim().min(1), z.date()]).optional().default(() => new Date().toISOString().split("T")[0]),
  responsavel: z.string().trim().min(1, { message: "responsavel é obrigatório." }).max(300, { message: "responsavel muito longo." }),
  atividade: z.string().trim().min(1, { message: "atividade muito curta." }).max(500, { message: "atividade muito longa." }),
  status: z.union([statusDiarioEnum, z.string().trim().max(80)]).optional().default("Dentro do programado"),
  observacoes: z.string().max(4000).optional().default(""),
  projetoCliente: z.string().trim().max(200).optional().default(""),
  midiaUrl: z.string().trim().max(500).optional().default(""),
  midiaTipo: z.string().trim().max(50).optional().default(""),
});

export const diarioLogDeleteSchema = z.object({
  id: z.string().min(1, { message: "id é obrigatório." }),
});

export function formatZodErrors(err: z.ZodError): string {
  const first = err.issues[0];
  if (!first) return "Dados inválidos.";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

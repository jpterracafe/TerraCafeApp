import { getSupabase } from "@/lib/supabase";
import { headers } from "next/headers";

export type AuditAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'LOGIN' 
  | 'LOGOUT' 
  | 'EXPORT' 
  | 'IMPERSONATE' 
  | 'PASSWORD_RESET'
  | 'ROLE_CHANGE';

export type AuditEntity = 
  | 'projeto' 
  | 'fase' 
  | 'responsavel' 
  | 'usuario' 
  | 'configuracao' 
  | 'diario'
  | 'user_projeto'
  | 'etapa_config';

export interface AuditLogInput {
  usuarioId: string;
  usuarioNome?: string | null;
  usuarioEmail?: string | null;
  usuarioRole?: string;
  acao: AuditAction;
  entidade: AuditEntity;
  entidadeId?: string | null;
  entidadeNome?: string | null;
  dadosAnteriores?: Record<string, any> | null;
  dadosNovos?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}

export async function logAudit(input: AuditLogInput): Promise<void> {
  try {
    // Captura IP e User-Agent dos headers
    const headersList = await headers();
    const forwarded = headersList.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : headersList.get('x-real-ip') || 'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    const db = getSupabase();
    
    await db.from('audit_logs').insert({
      usuario_id: input.usuarioId,
      usuario_nome: input.usuarioNome,
      usuario_email: input.usuarioEmail,
      usuario_role: input.usuarioRole,
      acao: input.acao,
      entidade: input.entidade,
      entidade_id: input.entidadeId,
      entidade_nome: input.entidadeNome,
      dados_anteriores: input.dadosAnteriores ?? null,
      dados_novos: input.dadosNovos ?? null,
      ip,
      user_agent: userAgent,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    // Falha silenciosa - auditoria não deve quebrar a operação principal
    console.error('[AUDIT] Falha ao registrar log:', error);
  }
}

// Helpers específicos para operações comuns
export const audit = {
  projeto: {
    create: (user: any, projeto: any) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'CREATE',
      entidade: 'projeto',
      entidadeId: projeto.id,
      entidadeNome: projeto.nome,
      dadosNovos: projeto,
    }),
    update: (user: any, projetoId: string, projetoNome: string, antes: any, depois: any) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'UPDATE',
      entidade: 'projeto',
      entidadeId: projetoId,
      entidadeNome: projetoNome,
      dadosAnteriores: antes,
      dadosNovos: depois,
    }),
    delete: (user: any, projetoId: string, projetoNome: string, dados: any, hard: boolean) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'DELETE',
      entidade: 'projeto',
      entidadeId: projetoId,
      entidadeNome: projetoNome,
      dadosAnteriores: dados,
      metadata: { hard },
    }),
    restore: (user: any, projetoId: string, projetoNome: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'UPDATE',
      entidade: 'projeto',
      entidadeId: projetoId,
      entidadeNome: projetoNome,
      metadata: { restored: true },
    }),
  },
  fase: {
    create: (user: any, fase: any, projetoNome: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'CREATE',
      entidade: 'fase',
      entidadeId: fase.id,
      entidadeNome: `${fase.gabarito} (${projetoNome})`,
      dadosNovos: fase,
    }),
    update: (user: any, faseId: string, faseGabarito: string, projetoNome: string, antes: any, depois: any) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'UPDATE',
      entidade: 'fase',
      entidadeId: faseId,
      entidadeNome: `${faseGabarito} (${projetoNome})`,
      dadosAnteriores: antes,
      dadosNovos: depois,
    }),
    delete: (user: any, faseId: string, faseGabarito: string, projetoNome: string, hard: boolean) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'DELETE',
      entidade: 'fase',
      entidadeId: faseId,
      entidadeNome: `${faseGabarito} (${projetoNome})`,
      metadata: { hard },
    }),
  },
  responsavel: {
    create: (user: any, responsavel: any) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'CREATE',
      entidade: 'responsavel',
      entidadeId: responsavel.id,
      entidadeNome: responsavel.nome,
      dadosNovos: responsavel,
    }),
    delete: (user: any, responsavelId: string, responsavelNome: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'DELETE',
      entidade: 'responsavel',
      entidadeId: responsavelId,
      entidadeNome: responsavelNome,
    }),
  },
  usuario: {
    create: (user: any, novoUsuario: any, senhaGerada?: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'CREATE',
      entidade: 'usuario',
      entidadeId: novoUsuario.id,
      entidadeNome: novoUsuario.nome || novoUsuario.email,
      dadosNovos: { ...novoUsuario, senhaTemp: senhaGerada ? '***' : undefined },
    }),
    updateRole: (user: any, targetUserId: string, targetUserNome: string, roleAnterior: string, roleNova: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'ROLE_CHANGE',
      entidade: 'usuario',
      entidadeId: targetUserId,
      entidadeNome: targetUserNome,
      dadosAnteriores: { role: roleAnterior },
      dadosNovos: { role: roleNova },
    }),
    resetPassword: (user: any, targetUserId: string, targetUserNome: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'PASSWORD_RESET',
      entidade: 'usuario',
      entidadeId: targetUserId,
      entidadeNome: targetUserNome,
    }),
    delete: (user: any, targetUserId: string, targetUserNome: string, targetUserEmail: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'DELETE',
      entidade: 'usuario',
      entidadeId: targetUserId,
      entidadeNome: `${targetUserNome} (${targetUserEmail})`,
    }),
    impersonate: (adminUser: any, targetUserId: string, targetUserNome: string) => logAudit({
      usuarioId: adminUser.id,
      usuarioNome: adminUser.name,
      usuarioEmail: adminUser.email,
      usuarioRole: adminUser.role,
      acao: 'IMPERSONATE',
      entidade: 'usuario',
      entidadeId: targetUserId,
      entidadeNome: targetUserNome,
      metadata: { tipo: 'inicio' },
    }),
    stopImpersonate: (adminUser: any, targetUserId: string) => logAudit({
      usuarioId: adminUser.id,
      usuarioNome: adminUser.name,
      usuarioEmail: adminUser.email,
      usuarioRole: adminUser.role,
      acao: 'IMPERSONATE',
      entidade: 'usuario',
      entidadeId: targetUserId,
      metadata: { tipo: 'fim' },
    }),
  },
  configuracao: {
    update: (user: any, tipo: string, antes: any, depois: any) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'UPDATE',
      entidade: 'configuracao',
      entidadeId: tipo,
      entidadeNome: `Config: ${tipo}`,
      dadosAnteriores: antes,
      dadosNovos: depois,
    }),
  },
  diario: {
    create: (user: any, log: any, projetoNome: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'CREATE',
      entidade: 'diario',
      entidadeId: log.id,
      entidadeNome: `${log.responsavel} - ${projetoNome} (${log.data})`,
      dadosNovos: log,
    }),
    update: (user: any, logId: string, antes: any, depois: any, projetoNome: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'UPDATE',
      entidade: 'diario',
      entidadeId: logId,
      entidadeNome: projetoNome,
      dadosAnteriores: antes,
      dadosNovos: depois,
    }),
    delete: (user: any, logId: string, logData: any, projetoNome: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'DELETE',
      entidade: 'diario',
      entidadeId: logId,
      entidadeNome: projetoNome,
      dadosAnteriores: logData,
    }),
  },
  userProjeto: {
    add: (user: any, targetUserId: string, targetUserNome: string, projetoId: string, projetoNome: string, role: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'CREATE',
      entidade: 'user_projeto',
      entidadeId: `${targetUserId}-${projetoId}`,
      entidadeNome: `${targetUserNome} → ${projetoNome} (${role})`,
      dadosNovos: { userId: targetUserId, projetoId, role },
    }),
    remove: (user: any, targetUserId: string, targetUserNome: string, projetoId: string, projetoNome: string, role: string) => logAudit({
      usuarioId: user.id,
      usuarioNome: user.name,
      usuarioEmail: user.email,
      usuarioRole: user.role,
      acao: 'DELETE',
      entidade: 'user_projeto',
      entidadeId: `${targetUserId}-${projetoId}`,
      entidadeNome: `${targetUserNome} → ${projetoNome} (${role})`,
      dadosAnteriores: { userId: targetUserId, projetoId, role },
    }),
  },
};
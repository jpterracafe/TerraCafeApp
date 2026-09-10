export type FaseNome = 
  | '01 - Estudo preliminar'
  | '02 - Aprovação do cliente ou retorno'
  | '03 - Projeto executivo'
  | '04 - Compra'
  | '05 - Execução'
  | string;

export type EtapaCampo =
  | 'Valetas'
  | 'montagem campo'
  | 'casa de bombas'
  | 'elétrica'
  | 'lavagem do sistema e testes'
  | 'entrega técnica';

export type StatusDiario = 
  | 'Dentro do programado'
  | 'Acima'
  | 'Abaixo'
  | 'Dentro do Programado'
  | 'Problema Técnico'
  | 'Aguardando Peças'
  | 'Chuva/Paralisação'
  | string;
export type StatusCronograma = 'No Prazo' | 'Atrasado' | 'Concluído';

export interface FaseProjeto {
  id: string;
  projetoId: string;
  nomeFase: FaseNome;
  responsavel: string;
  status: StatusCronograma;
  dataInicio: string;
  dataFimPrevista: string;
  dataFimReal?: string;
}

export interface CronogramaPrazo {
  id: string;
  faseId: string;
  acao: string;
  responsavel: string;
  prazoLimite: string;
  status: StatusCronograma;
  diasDiferenca?: number; // Calculated dynamically
}

export interface RegistroDiarioCampo {
  id: string;
  data: string; // YYYY-MM-DD
  responsavel: string;
  atividade: string;
  status: StatusDiario;
  observacoes: string;
  projetoCliente?: string;
  midiaUrl?: string;
  midiaTipo?: string; // 'image' | 'video'
}

import { FaseNome } from '../types';

export type StatusType = 'Dentro do programado' | 'Problema técnico' | 'Aguardando material' | 'Concluído' | 'Comercial/Ajustes';
export type ActionType = 'Comprar' | 'Cotar' | 'Instalar' | 'Vistoriar' | 'Aprovar' | 'Revisar';

export interface FaseAcao {
  id: string;
  gabarito: FaseNome;
  responsavel: string;
  acao: ActionType;
  prazoLimite: string;
  status: StatusType;
  observacoes?: string;
  projetoCliente?: string;
  isDeleted?: boolean;
}

// Fixed current date for deterministic mock data testing: '2026-08-27'
export const mockFases: FaseAcao[] = [
  {
    id: 'f1',
    gabarito: '01 - Estudo preliminar',
    responsavel: 'Carlos Silva',
    acao: 'Aprovar',
    prazoLimite: '2026-08-15',
    status: 'Concluído',
  },
  {
    id: 'f2',
    gabarito: '02 - Aprovação do cliente ou retorno',
    responsavel: 'Ana Pereira',
    acao: 'Revisar',
    prazoLimite: '2026-08-30',
    status: 'Comercial/Ajustes',
    observacoes: 'Ajuste de escopo pelo cliente (Loop).',
  },
  {
    id: 'f3',
    gabarito: '03 - Projeto executivo',
    responsavel: 'João Pedro',
    acao: 'Aprovar',
    prazoLimite: '2026-08-25',
    status: 'Aguardando material',
  },
  {
    id: 'f4',
    gabarito: '04 - Compra',
    responsavel: 'Mariana Costa',
    acao: 'Comprar',
    prazoLimite: '2026-09-05',
    status: 'Dentro do programado',
  },
  {
    id: 'f5',
    gabarito: '05 - Execução',
    responsavel: 'Marcos Almeida',
    acao: 'Instalar',
    prazoLimite: '2026-08-20',
    status: 'Problema técnico',
    observacoes: 'Chuva atrasou a obra.'
  }
];

export type OrigemResponsavel = 'BANCO_DADOS' | 'MANUAL';

export interface Responsavel {
  id: string;
  nome: string;
  cargo: string;
  origem: OrigemResponsavel;
  avatar: string;
}

export const mockResponsaveis: Responsavel[] = [
  {
    id: 'r1',
    nome: 'Carlos Silva',
    cargo: 'Encarregado de Obras',
    origem: 'BANCO_DADOS',
    avatar: 'CS'
  },
  {
    id: 'r2',
    nome: 'Ana Pereira',
    cargo: 'Supervisora de Projetos',
    origem: 'BANCO_DADOS',
    avatar: 'AP'
  },
  {
    id: 'r3',
    nome: 'João Pedro',
    cargo: 'Operador de Máquinas',
    origem: 'MANUAL',
    avatar: 'JP'
  },
  {
    id: 'r4',
    nome: 'Marcos Almeida',
    cargo: 'Técnico de Campo',
    origem: 'MANUAL',
    avatar: 'MA'
  },
  {
    // DUPLICATE INTENTIONALLY
    id: 'r5',
    nome: 'Carlos Silva',
    cargo: 'Técnico Terceirizado',
    origem: 'MANUAL',
    avatar: 'CS'
  }
];

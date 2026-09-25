export type RoleSistema = 'Montador' | 'Gerente' | 'Coordenador' | 'Diretor' | 'Admin' | 'Desenvolvedor' | 'Agricultor' | 'Colaborador';

export interface UsuarioSistema {
  id: string;
  nome: string;
  email: string;
  cargo: RoleSistema;
  loja?: string;
  status: 'Ativo' | 'Pendente' | 'Bloqueado';
  ultimoLogin?: string;
  avatar: string;
  senhaGerada?: string;
}

export const mockUsuariosSistema: UsuarioSistema[] = [
  {
    id: 'u1',
    nome: 'João Souza',
    email: 'joao2005souza@gmail.com',
    cargo: 'Desenvolvedor',
    status: 'Ativo',
    ultimoLogin: new Date().toISOString(),
    avatar: 'JS'
  }
];

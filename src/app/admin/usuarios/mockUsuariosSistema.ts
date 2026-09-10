export type RoleSistema = 'Agricultor' | 'Admin' | 'Diretor' | 'Desenvolvedor' | 'Colaborador';

export interface UsuarioSistema {
  id: string;
  nome: string;
  email: string;
  cargo: RoleSistema;
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

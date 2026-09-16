export type UserRole = 'Administrador' | 'Diretor' | 'Desenvolvedor' | 'Agricultor' | 'Colaborador';

export interface UserWithRole {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  'Administrador': 5,
  'Desenvolvedor': 5,
  'Diretor': 4,
  'Agricultor': 2,
  'Colaborador': 1,
};

export const isAdminRole = (role: string): boolean => {
  return role === 'Administrador' || role === 'Desenvolvedor';
};

export const isDirectorRole = (role: string): boolean => {
  return role === 'Diretor';
};

export const isFarmerRole = (role: string): boolean => {
  return role === 'Agricultor';
};

export const isMasterRole = (role: string): boolean => {
  return isAdminRole(role) || isDirectorRole(role);
};

export const canSeeAllProjects = (role: string): boolean => {
  return isMasterRole(role);
};

export const canAccessDirectorDashboard = (role: string): boolean => {
  return isMasterRole(role);
};

export const canManageUsers = (role: string): boolean => {
  return isAdminRole(role);
};

export const getAllowedPages = (role: string): string[] => {
  const basePages = [
    '/irrigacao/diario-campo',
    '/irrigacao/execucao',
    '/irrigacao/responsaveis',
    '/irrigacao/lixeira',
  ];

  if (isMasterRole(role)) {
    return [
      '/visao-geral',
      '/admin/dashboard',
      ...basePages,
    ];
  }

  if (isFarmerRole(role)) {
    return basePages;
  }

  return ['/irrigacao/diario-campo'];
};

export const filterProjectsForUser = (
  projects: string[],
  userRole: string,
  userName: string,
  userProjects?: string[]
): string[] => {
  if (canSeeAllProjects(userRole)) {
    return projects;
  }

  if (isFarmerRole(userRole) && userProjects && userProjects.length > 0) {
    return projects.filter(p => userProjects.includes(p));
  }

  return [];
};

export const getUserProjectFilter = (userRole: string, userName: string, userProjects?: string[]): string | null => {
  if (canSeeAllProjects(userRole)) {
    return null;
  }

  if (isFarmerRole(userRole) && userProjects && userProjects.length > 0) {
    return userProjects[0];
  }

  return null;
};
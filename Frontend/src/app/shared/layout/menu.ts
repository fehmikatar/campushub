import { Role } from '../../core/auth/role';
import { IconData } from '../icon/icon';
import { Icons } from '../icon/icons';

export interface MenuItem {
  label: string;
  path: string;
  icon: IconData;
}

const home: MenuItem = { label: 'Accueil', path: '/accueil', icon: Icons.house };
const myCourses: MenuItem = { label: 'Mes cours', path: '/mes-cours', icon: Icons.bookOpen };
const forum: MenuItem = { label: 'Forum', path: '/forum', icon: Icons.messageSquare };
const evaluations: MenuItem = { label: 'Évaluations', path: '/evaluations', icon: Icons.clipboardList };
const notifications: MenuItem = { label: 'Notifications', path: '/notifications', icon: Icons.bell };

/** Menu de la sidebar selon le rôle. */
export const MENUS: Record<Role, readonly MenuItem[]> = {
  ETUDIANT: [
    home,
    myCourses,
    { label: 'Catalogue', path: '/catalogue', icon: Icons.layoutGrid },
    forum,
    evaluations,
    notifications,
  ],
  ENSEIGNANT: [home, myCourses, forum, evaluations, notifications],
  ADMIN: [
    home,
    { label: 'Utilisateurs', path: '/utilisateurs', icon: Icons.users },
    { label: 'Cours', path: '/cours', icon: Icons.library },
    forum,
    { label: 'Catégories', path: '/categories', icon: Icons.tags },
    notifications,
  ],
};

import { IconData } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';

export type Tone = 'indigo' | 'amber' | 'green' | 'slate';

export interface NotificationMeta {
  icon: IconData;
  tone: Tone;
  /** Page à ouvrir au clic (null = aucune). */
  link: string[] | null;
}

const forum: NotificationMeta = { icon: Icons.messageSquare, tone: 'indigo', link: ['/forum'] };

const META: Record<string, NotificationMeta> = {
  'forum.reply': forum,
  'forum.like': forum,
  'forum.accepted': forum,
  'forum.locked': forum,
  'forum.resolved': forum,
  grade: { icon: Icons.award, tone: 'amber', link: ['/evaluations'] },
  deadline: { icon: Icons.calendarClock, tone: 'amber', link: ['/evaluations'] },
  announcement: { icon: Icons.megaphone, tone: 'green', link: null },
  system: { icon: Icons.info, tone: 'slate', link: null },
};

export function metaFor(type: string): NotificationMeta {
  return META[type] ?? META['system'];
}

export interface PreferenceGroup {
  key: string;
  label: string;
  description: string;
  /** Types de notifications coupés quand le groupe est désactivé. */
  types: readonly string[];
}

/** Regroupement des types pour l'écran « Préférences » (l'API ne connaît que des types individuels). */
export const PREFERENCE_GROUPS: readonly PreferenceGroup[] = [
  {
    key: 'forum',
    label: 'Forum',
    description: 'Réponses à vos sujets, « j\'aime », réponses validées, sujets résolus ou verrouillés.',
    types: ['forum.reply', 'forum.like', 'forum.accepted', 'forum.locked', 'forum.resolved'],
  },
  {
    key: 'cours',
    label: 'Cours et annonces',
    description: 'Nouveaux cours publiés et annonces de la plateforme.',
    types: ['announcement', 'system'],
  },
  {
    key: 'evaluations',
    label: 'Évaluations',
    description: 'Résultats de quiz et échéances.',
    types: ['grade', 'deadline'],
  },
];

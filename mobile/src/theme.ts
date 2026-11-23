// CLOQI design tokens – same values as the website (tailwind.config.ts). Keep both in sync.

export const colors = {
  lime: '#A4D92D',
  leaf: '#7CC51B',
  leafDark: '#286B24',
  leafDeep: '#19451F',
  leafSoft: '#EDF6E3',
  beige: '#D9C3A2',
  paper: '#F8F7F2',
  white: '#FFFFFF',
  ink: '#191A17',
  inkSoft: '#55584F',
  inkFaint: '#8B8E84',
  line: '#E6E4DA',
  warn: '#F08C2E',
  warnSoft: '#FDEBD8',
  danger: '#E5484D',
  dangerSoft: '#FCE4E4',
  info: '#3B82F6',
  ai: '#8B5CF6',
};

/** Category colors (lib/types.ts CATEGORY_META on the website). */
export const categoryColor: Record<string, string> = {
  schule: '#286B24', lernen: '#7CC51B', pruefung: '#E5484D', hausuebung: '#F08C2E',
  training: '#1FA59A', arbeit: '#9A7B4F', freizeit: '#E06A9E', privat: '#5B6472',
};
export const categorySoft: Record<string, string> = {
  schule: '#E3EFE1', lernen: '#EDF6E3', pruefung: '#FCE4E4', hausuebung: '#FDEBD8',
  training: '#DDF3F1', arbeit: '#F3EBDD', freizeit: '#FBE5EF', privat: '#E9EBEE',
};
export const categoryLabel: Record<string, string> = {
  schule: 'Schule / Uni', lernen: 'Lernen', pruefung: 'Prüfung', hausuebung: 'Hausübung',
  training: 'Training', arbeit: 'Arbeit', freizeit: 'Freizeit', privat: 'Privat',
};

export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  display: 'Fredoka_600SemiBold',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, full: 999 };

export const shadow = {
  shadowColor: '#19451F',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

/** Calendar highlights – same rule as the website (lib/types.ts itemMark). */
export type ItemMark = 'exam' | 'cancelled' | null;
export function itemMark(i: { category: string; status: string }): ItemMark {
  if (i.status === 'cancelled') return 'cancelled';
  if (i.category === 'pruefung' && i.status !== 'done') return 'exam';
  return null;
}
export const MARK_STYLE = {
  exam: { label: 'Test', color: '#E5484D', soft: '#FCE4E4', text: '#A8262B' },
  cancelled: { label: 'Entfall', color: '#F08C2E', soft: '#FDEBD8', text: '#A55912' },
} as const;

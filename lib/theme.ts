export type Theme = 'light' | 'dark';

export const THEME_COOKIE = 'theme';
export const DEFAULT_THEME: Theme = 'light';

export const parseTheme = (value?: string): Theme => (value === 'dark' || value === 'light' ? value : DEFAULT_THEME);

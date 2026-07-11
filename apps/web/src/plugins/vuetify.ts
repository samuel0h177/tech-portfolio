import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';

// NASA / ESTO-inspired palette: deep NASA blue, bright accent blue, clean surfaces.
const estoLight = {
  dark: false,
  colors: {
    background: '#f4f6fb',
    surface: '#ffffff',
    'surface-variant': '#e8eef7',
    primary: '#0b3d91', // NASA blue
    'primary-darken-1': '#082d6b',
    secondary: '#1a75cf', // bright accent
    accent: '#8fd1fb',
    info: '#1a75cf',
    success: '#2e7d5b',
    warning: '#c77700',
    error: '#c0392b',
    'on-primary': '#ffffff',
    'on-surface': '#1a1f2b',
  },
};

const estoDark = {
  dark: true,
  colors: {
    background: '#0b1120',
    surface: '#151d2e',
    'surface-variant': '#1f2942',
    primary: '#5aa2f0', // lighter blue so text/links stay legible on dark surfaces
    'primary-darken-1': '#0b3d91',
    secondary: '#7ab8ff',
    accent: '#8fd1fb',
    info: '#5aa2f0',
    success: '#3fa877',
    warning: '#e0982f',
    error: '#e05545',
    'on-primary': '#0a1020', // dark text on the lighter primary fill
    'on-surface': '#e6ebf5',
  },
};

export const THEME_STORAGE_KEY = 'esto-theme';
export const LIGHT_THEME = 'estoLight';
export const DARK_THEME = 'estoDark';

/** Initial theme from a saved preference, falling back to the OS setting. */
function initialTheme(): string {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === LIGHT_THEME || stored === DARK_THEME) return stored;
  } catch {
    /* localStorage may be unavailable */
  }
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? DARK_THEME : LIGHT_THEME;
}

export default createVuetify({
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: initialTheme(),
    themes: { estoLight, estoDark },
  },
  defaults: {
    VCard: { rounded: 'lg' },
    VBtn: { rounded: 'md', style: 'text-transform: none; font-weight: 600;' },
    VTextField: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VAutocomplete: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
  },
});

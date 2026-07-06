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

export default createVuetify({
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: 'estoLight',
    themes: { estoLight },
  },
  defaults: {
    VCard: { rounded: 'lg' },
    VBtn: { rounded: 'md', style: 'text-transform: none; font-weight: 600;' },
    VTextField: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VAutocomplete: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
  },
});

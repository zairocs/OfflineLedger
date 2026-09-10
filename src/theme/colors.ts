// OfflineLedger Design System — Color Tokens
// Palette: Black & White / Grayscale Monochromatic Theme

export const palette = {
  // Brand / Neutral Grays
  gray950: '#0A0A0A',
  gray900: '#121212',
  gray850: '#1A1A1A',
  gray800: '#222222',
  gray700: '#333333',
  gray600: '#4D4D4D',
  gray500: '#666666',
  gray400: '#888888',
  gray300: '#B0B0B0',
  gray200: '#D8D8D8',
  gray100: '#E8E8E8',
  gray50:  '#F5F5F5',

  white:   '#FFFFFF',
  black:   '#000000',
};

export const darkColors = {
  // Backgrounds
  background:       palette.gray900,
  surface:          palette.gray800,
  surfaceVariant:   palette.gray700,
  surfaceOverlay:   'rgba(18, 18, 18, 0.85)',

  // Brand
  primary:          palette.white,
  primaryVariant:   palette.gray200,
  primaryContainer: 'rgba(255, 255, 255, 0.12)',

  // Status
  success:          palette.gray200,
  successContainer: 'rgba(255, 255, 255, 0.1)',
  error:            palette.gray400,
  errorContainer:   'rgba(255, 255, 255, 0.08)',

  // Text
  textPrimary:      palette.white,
  textSecondary:    palette.gray300,
  textDisabled:     palette.gray500,
  textOnPrimary:    palette.gray900,

  // UI
  border:           palette.gray700,
  divider:          'rgba(255, 255, 255, 0.1)',
  icon:             palette.gray300,
  iconActive:       palette.white,
  overlay:          'rgba(0, 0, 0, 0.75)',

  // Card / Sheet
  card:             palette.gray800,
  cardBorder:       'rgba(255, 255, 255, 0.08)',

  // Specific
  balancePositive:  palette.white,
  balanceNegative:  palette.gray400,
  advanceAmount:    palette.gray200,
};

export const lightColors = {
  background:       palette.gray50,
  surface:          palette.white,
  surfaceVariant:   palette.gray100,
  surfaceOverlay:   'rgba(255, 255, 255, 0.9)',

  primary:          palette.gray850,
  primaryVariant:   palette.gray700,
  primaryContainer: 'rgba(0, 0, 0, 0.08)',

  success:          palette.gray700,
  successContainer: 'rgba(0, 0, 0, 0.06)',
  error:            palette.gray500,
  errorContainer:   'rgba(0, 0, 0, 0.06)',

  textPrimary:      palette.gray950,
  textSecondary:    palette.gray500,
  textDisabled:     palette.gray400,
  textOnPrimary:    palette.white,

  border:           palette.gray200,
  divider:          'rgba(0, 0, 0, 0.08)',
  icon:             palette.gray500,
  iconActive:       palette.gray850,
  overlay:          'rgba(0, 0, 0, 0.5)',

  card:             palette.white,
  cardBorder:       palette.gray200,

  balancePositive:  palette.gray850,
  balanceNegative:  palette.gray500,
  advanceAmount:    palette.gray700,
};

export type AppColors = typeof darkColors;

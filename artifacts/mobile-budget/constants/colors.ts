/**
 * Jamvi brand tokens shared with family-budget/src/index.css.
 *
 * Logo palette: navy #011C4E, royal blue #003383, turquoise #08B7B0,
 * bright green #3CDD62, and gold #FDBB0A. Keep status roles separate so
 * success, warning, and destructive states stay immediately understandable.
 */

const colors = {
  light: {
    // Legacy aliases
    text: '#06224F',
    tint: '#011C4E',

    // Surfaces
    background: '#F5F8FC',
    foreground: '#06224F',

    // Cards
    card: '#FFFFFF',
    cardForeground: '#06224F',

    // Primary — Jamvi navy
    primary: '#011C4E',
    primaryForeground: '#ffffff',

    // Secondary — Jamvi gold
    secondary: '#FDBB0A',
    secondaryForeground: '#011C4E',

    // Muted
    muted: '#E7EFF8',
    mutedForeground: '#4D6687',

    // Accent — turquoise tint
    accent: '#E1F6F4',
    accentForeground: '#0B6A69',

    // Destructive
    destructive: '#d92626',
    destructiveForeground: '#ffffff',
    success: '#209E45',
    successForeground: '#ffffff',
    warning: '#C98C00',
    warningForeground: '#011C4E',
    info: '#003383',
    infoForeground: '#ffffff',

    // Logo and focus
    brandNavy: '#011C4E',
    brandBlue: '#003383',
    brandTeal: '#08B7B0',
    brandGreen: '#3CDD62',
    brandGold: '#FDBB0A',
    logoSurface: '#E7EFFB',
    focus: '#08B7B0',

    // Borders / inputs
    border: '#D7E3F1',
    input: '#C3D3E8',
    dropdownBackground: '#FFFFFF',
    dropdownForeground: '#06224F',
    dropdownMutedForeground: '#4D6687',
    dropdownBorder: '#D7E3F1',
  },

  dark: {
    text: '#F4F8FF',
    tint: '#2D70C8',

    background: '#040F29',
    foreground: '#F4F8FF',

    card: '#091A3D',
    cardForeground: '#F4F8FF',

    primary: '#2D70C8',
    primaryForeground: '#ffffff',

    secondary: '#FDBB0A',
    secondaryForeground: '#011C4E',

    muted: '#10274F',
    mutedForeground: '#A5B9D4',

    accent: '#124A4B',
    accentForeground: '#9BE5DF',

    destructive: '#e53e3e',
    destructiveForeground: '#ffffff',
    success: '#3CDD62',
    successForeground: '#040F29',
    warning: '#FDBB0A',
    warningForeground: '#011C4E',
    info: '#6C9FE6',
    infoForeground: '#040F29',

    brandNavy: '#011C4E',
    brandBlue: '#003383',
    brandTeal: '#08B7B0',
    brandGreen: '#3CDD62',
    brandGold: '#FDBB0A',
    logoSurface: '#E7EFFB',
    focus: '#2DD4CC',

    border: '#1D3B67',
    input: '#28517E',
    dropdownBackground: '#091A3D',
    dropdownForeground: '#F4F8FF',
    dropdownMutedForeground: '#A5B9D4',
    dropdownBorder: '#1D3B67',
  },

  // 0.75rem = 12px — matches web app's --radius: 0.75rem
  radius: 12,
};

export default colors;

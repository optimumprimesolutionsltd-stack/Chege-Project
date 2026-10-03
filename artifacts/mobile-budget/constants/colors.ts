/**
 * Jamvi brand tokens shared with the web app styles.
 *
 * The mat (matches jamvi.co.ke and the web app): jade #0D4A43, jade mid
 * #14776A, clay #B24A24 / #D9663B, sisal gold #E9B949, ink #0B1F2A on a
 * paper ground #FBF7EC. Keep status roles separate so success, warning, and
 * destructive states stay immediately understandable.
 *
 * The brand* names are kept so existing styles keep working; they now hold
 * the mat colours.
 */

const colors = {
  light: {
    // Legacy aliases
    text: '#0B1F2A',
    tint: '#0D4A43',

    // Surfaces
    background: '#FBF7EC',
    foreground: '#0B1F2A',

    // Cards
    card: '#FEFCF6',
    cardForeground: '#0B1F2A',

    // Primary — jade
    primary: '#0D4A43',
    primaryForeground: '#FBF7EC',

    // Secondary — sisal gold
    secondary: '#E9B949',
    secondaryForeground: '#0B1F2A',

    // Muted
    muted: '#F1EBDB',
    mutedForeground: '#4A5E63',

    // Accent — warm gold tint
    accent: '#F6EDD3',
    accentForeground: '#0D4A43',

    // Destructive
    destructive: '#C42323',
    destructiveForeground: '#ffffff',
    success: '#277A45',
    successForeground: '#ffffff',
    warning: '#B26A0E',
    warningForeground: '#ffffff',
    info: '#14776A',
    infoForeground: '#ffffff',

    // Logo and focus
    brandNavy: '#0B1F2A',
    brandBlue: '#14776A',
    brandTeal: '#14776A',
    brandGreen: '#2E9150',
    brandGold: '#E9B949',
    logoSurface: '#FBF7EC',
    focus: '#14776A',

    // Borders / inputs
    border: '#E2D8BF',
    input: '#D3C6A6',
    dropdownBackground: '#FEFCF6',
    dropdownForeground: '#0B1F2A',
    dropdownMutedForeground: '#4A5E63',
    dropdownBorder: '#E2D8BF',
  },

  // "Jamvi night"
  dark: {
    text: '#FBF7EC',
    tint: '#E9B949',

    background: '#0A1A1C',
    foreground: '#FBF7EC',

    card: '#102527',
    cardForeground: '#FBF7EC',

    primary: '#E9B949',
    primaryForeground: '#0B1F2A',

    secondary: '#E9B949',
    secondaryForeground: '#0B1F2A',

    muted: '#16302F',
    mutedForeground: '#C2BBA8',

    accent: '#1B3634',
    accentForeground: '#E9B949',

    destructive: '#E05252',
    destructiveForeground: '#ffffff',
    success: '#5CC77F',
    successForeground: '#0A1A1C',
    warning: '#EEB04A',
    warningForeground: '#0A1A1C',
    info: '#5FC2B2',
    infoForeground: '#0A1A1C',

    brandNavy: '#0B1F2A',
    brandBlue: '#14776A',
    brandTeal: '#5FC2B2',
    brandGreen: '#5CC77F',
    brandGold: '#E9B949',
    logoSurface: '#FBF7EC',
    focus: '#E9B949',

    border: '#24413F',
    input: '#335654',
    dropdownBackground: '#102527',
    dropdownForeground: '#FBF7EC',
    dropdownMutedForeground: '#C2BBA8',
    dropdownBorder: '#24413F',
  },

  // 6px, matching the web app's --radius: 0.375rem.
  radius: 6,
};

export default colors;

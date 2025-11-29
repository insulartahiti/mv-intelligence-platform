/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Design system colors - Darker Professional Theme
        bg: "#0A0A0A",           // Background 900 - Very Dark
        surface: "#0F0F10",      // Surface 850 - Darker
        border: "#1A1A1C",       // Border - Darker
        text: {
          primary: "#F5F5F5",    // Primary text - Brighter for contrast
          secondary: "#B8B8BC",  // Secondary text - Better contrast
          muted: "#8A8A8F"       // Muted text - Improved readability
        },
        intent: {
          positive: "#22C55E",   // Positive - Brighter green
          warning: "#F59E0B",    // Warning - Brighter yellow
          danger: "#EF4444"      // Danger - Brighter red
        },
        // MV Glass Design System Colors - Darker Theme
        accent: 'var(--accent)',
        onGlass: 'var(--on-glass)',
        onGlassMuted: 'var(--on-glass-muted)',
        onGlassDark: 'var(--on-glass-dark)',
        onGlassDarkMuted: 'var(--on-glass-dark-muted)',
        accentEmboss: 'var(--accent-emboss)',
      },
      spacing: {
        // Base unit: 8px
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        // MV Glass spacing tokens
        '1': 'var(--space-1)',
        '2': 'var(--space-2)', 
        '3': 'var(--space-3)',
        '4': 'var(--space-4)',
        '6': 'var(--space-6)',
        '8': 'var(--space-8)',
        '12': 'var(--space-12)',
      },
      borderRadius: {
        'card': '16px',          // rounded-2xl for cards
        'sm': '6px',
        'md': '10px',
        'lg': '14px',
        // MV Glass radius tokens
        'xs': 'var(--radius-xs)',
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
      },
      boxShadow: {
        'card': '0 8px 24px rgba(0,0,0,0.4)',
        'focus': '0 0 0 2px rgba(245, 245, 245, 0.25)', // Focus ring - Better contrast
        // MV Glass elevation tokens
        'elev0': 'var(--elev-0)',
        'elev1': 'var(--elev-1)',
        'elev2': 'var(--elev-2)',
        'elev3': 'var(--elev-3)',
      },
      transitionDuration: {
        'fast': '80ms',          // Hover transitions
        'base': '160ms',         // Entrance/exit transitions
        // MV Glass duration tokens
        'sm': 'var(--dur-sm)',
        'md': 'var(--dur-md)',
        'lg': 'var(--dur-lg)',
      },
      transitionTimingFunction: {
        'ui': 'var(--ease-ui)',
      },
      backdropBlur: { 
        'glass': 'var(--glass-blur)' 
      },
      saturate: { 
        '120': 'var(--glass-saturate)' 
      }
    }
  },
  plugins: [
    require('@tailwindcss/typography'),
  ]
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--color-canvas)',
        surface: 'var(--color-surface)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        line: 'var(--color-line)',
        accent: 'var(--color-accent)',
        'accent-soft': 'var(--color-accent-soft)',
        sidebar: 'var(--color-sidebar)'
      },
      boxShadow: {
        card: '0 1px 2px rgb(14 20 40 / 0.06), 0 8px 24px -12px rgb(14 20 40 / 0.14)'
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        brand: ['Montserrat', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};

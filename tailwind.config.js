/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.{html,js,jsx,ts,tsx}'],
    theme: {
        extend: {
            colors: {
                'ui-bg': 'var(--ui-bg)',
                'ui-bg-elevated': 'var(--ui-bg-elevated)',
                'ui-bg-subtle': 'var(--ui-bg-subtle)',
                'ui-fg': 'var(--ui-fg)',
                'ui-fg-muted': 'var(--ui-fg-muted)',
                'ui-border': 'rgba(255, 255, 255, 0.06)',
                'ui-border-subtle': 'rgba(255, 255, 255, 0.03)',
                'ui-hover': 'rgba(255, 255, 255, 0.05)',
                accent: 'var(--accent)',
                'accent-hover': 'var(--accent-hover)',
                sidebar: 'var(--sidebar-bg)',
                success: 'var(--color-success)',
                warn: 'var(--color-warning)',
                danger: 'var(--color-error)',
                oxo: {
                    base00: '#0a0a0a',
                    base01: '#141414',
                    base02: '#1e1e1e',
                    base03: '#3a3a3a',
                    base04: '#a0a8b0',
                    base05: '#d8dce0',
                    base06: '#ffffff',
                    blue: '#6fa0ff',
                    cyan: '#2dd4d1',
                    teal: '#06b8b5',
                    'light-blue': '#75c7ff',
                    'sky-blue': '#2fb8ff',
                    pink: '#ff4d9e',
                    'light-pink': '#ff6eb8',
                    green: '#3bc95f',
                    purple: '#b88dff',
                },
            },
            fontFamily: {
                mono: 'var(--font-mono)',
                sans: 'var(--font-sans)',
            },
            keyframes: {
                shimmer: {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
                'glow-pulse': {
                    '0%, 100%': {
                        opacity: '0.5',
                        transform: 'translateX(-50%) scale(1)',
                    },
                    '50%': {
                        opacity: '1',
                        transform: 'translateX(-50%) scale(1.12)',
                    },
                },
                'live-dot': {
                    '0%, 100%': { opacity: '1', transform: 'scale(1)' },
                    '50%': { opacity: '0.35', transform: 'scale(0.65)' },
                },
                'progress-run': {
                    '0%': { transform: 'translateX(-150%)' },
                    '100%': { transform: 'translateX(350%)' },
                },
                blink: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0' },
                },
            },
            animation: {
                shimmer: 'shimmer 1.6s ease-in-out infinite',
                'shimmer-fast': 'shimmer 1s linear infinite',
                'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
                'live-dot': 'live-dot 1.2s ease-in-out infinite',
                progress: 'progress-run 1.4s ease-in-out infinite',
                blink: 'blink 0.8s step-end infinite',
            },
            backgroundSize: {
                200: '200% 100%',
            },
        },
    },
    plugins: [],
}

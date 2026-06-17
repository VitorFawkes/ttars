import typography from '@tailwindcss/typography'
import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)'
            },
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                // Marca por workspace via CSS vars (ver index.css):
                // :root = Trips (azul). .theme-ww em <html> = Weddings (dourado ww-*).
                primary: {
                    DEFAULT: "rgb(var(--brand-primary) / <alpha-value>)",
                    foreground: "#ffffff",
                    dark: "rgb(var(--brand-primary-dark) / <alpha-value>)",
                    light: "rgb(var(--brand-primary-light) / <alpha-value>)",
                },
                secondary: {
                    DEFAULT: "rgb(var(--brand-secondary) / <alpha-value>)",
                    foreground: "#ffffff",
                },
                surface: {
                    light: "#ffffff",
                    dark: "#252836",
                },
                glass: {
                    DEFAULT: "rgba(255, 255, 255, 0.05)",
                    border: "rgba(255, 255, 255, 0.1)",
                    highlight: "rgba(255, 255, 255, 0.1)",
                },
                'background-light': "#f8f9fc",
                'background-dark': "#1a1c23",
                'text-main': {
                    light: "#1e293b",
                    dark: "#f1f5f9",
                },
                'text-sub': {
                    light: "#64748b",
                    dark: "#94a3b8",
                },
                success: "#10b981",
                'purple-accent': "#a855f7",
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "#F8F9FA",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                // Keep product colors for legacy compatibility or specific badges
                product: {
                    trips: "#00c4cc", // Aligned with secondary
                    wedding: "#FF8A65",
                    corp: "#A176E3",
                },
                chart: {
                    '1': 'hsl(var(--chart-1))',
                    '2': 'hsl(var(--chart-2))',
                    '3': 'hsl(var(--chart-3))',
                    '4': 'hsl(var(--chart-4))',
                    '5': 'hsl(var(--chart-5))'
                },
                // Welcome Weddings brand tokens (lista de convidados)
                ww: {
                    gold: '#BD965C',
                    'gold-soft': 'rgba(189,150,92,0.10)',
                    'gold-ink': '#a37f47',
                    rosewood: '#874B52',
                    'rosewood-soft': 'rgba(135,75,82,0.10)',
                    blush: '#EAA794',
                    petal: '#E9CDD0',
                    olive: '#8F7E35',
                    'olive-soft': 'rgba(143,126,53,0.14)',
                    'olive-ink': '#6e6028',
                    paper: '#FBF8F4',
                    cream: '#F5EFE7',
                    sand: '#EAE1D3',
                    'sand-dk': '#D9CFC2',
                    n400: '#B5ABA0',
                    n500: '#8A8278',
                    n600: '#5C5751',
                    n700: '#3A3633',
                    error: '#D14124',
                    success: '#4F7A4A',
                },
            },
            fontFamily: {
                mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
                'ww-display': ['Nunito', 'system-ui', 'sans-serif'],
                'ww-serif': ['"Roboto Serif"', '"Playfair Display"', 'Georgia', 'serif'],
                coolvetica: ['Coolvetica', 'system-ui', 'sans-serif'],
            },
            boxShadow: {
                'soft': '0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.02)',
                'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
                'ww-lift': '0 8px 28px rgba(78, 24, 32, 0.06)',
                'ww-modal': '0 30px 100px rgba(78, 24, 32, 0.2)',
                'ww-toast': '0 16px 48px rgba(78, 24, 32, 0.12)',
            },
            transitionTimingFunction: {
                'ww-soft': 'cubic-bezier(0.32, 0.72, 0, 1)',
                'out-strong': 'cubic-bezier(0.23, 1, 0.32, 1)',
            }
        }
    },
    plugins: [
        typography,
        // Variante de tema por workspace: `ww:` aplica estilo só quando o tema
        // Weddings está ativo (.theme-ww no <html>, via useOrgBranding).
        plugin(({ addVariant }) => addVariant('ww', '.theme-ww &')),
    ],
}

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
            fontFamily: {
                mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
            },
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "#0f4c81", // Deep sophisticated blue
                    foreground: "#ffffff",
                    dark: "#0a3a5f",
                    light: "#e0e7ff", // Light blue for backgrounds
                },
                secondary: {
                    DEFAULT: "#00c4cc", // Teal accent
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
                }
            },
            boxShadow: {
                'soft': '0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.02)',
                'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }
        }
    },
    plugins: [],
}

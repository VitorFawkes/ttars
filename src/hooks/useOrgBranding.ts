import { useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'

/**
 * Aplica branding da org no documento: título, favicon, CSS variables de cores.
 * Use em Layout.tsx (uma vez, no nível mais alto possível).
 */
export function useOrgBranding() {
    const { org } = useOrg()

    useEffect(() => {
        if (!org) return

        // Título do browser
        document.title = org.name

        // Favicon dinâmico — se org tem logo, usa como favicon
        if (org.logo_url) {
            const favicon = document.getElementById('favicon-link') as HTMLLinkElement | null
            if (favicon) {
                favicon.href = org.logo_url
            }
        }

        // CSS variables para cores de marca
        const primary = org.branding?.primary_color
        const accent = org.branding?.accent_color
        const root = document.documentElement

        // Tema de marca por workspace: Weddings veste a paleta champagne/dourada
        // (.theme-ww remapeia --brand-* e tokens shadcn no index.css). Aplicado em
        // <html> para alcançar modais/popovers renderizados em portal.
        root.classList.toggle('theme-ww', org.slug === 'welcome-weddings')

        if (primary) {
            root.style.setProperty('--org-primary', primary)
        }
        if (accent) {
            root.style.setProperty('--org-accent', accent)
        }

        // Theme-color meta (afeta barra superior de browsers mobile)
        if (primary) {
            const themeColor = document.querySelector('meta[name="theme-color"]')
            if (themeColor) {
                themeColor.setAttribute('content', primary)
            }
        }
    }, [org])
}

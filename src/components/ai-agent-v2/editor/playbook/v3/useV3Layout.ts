import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'ai_agent_editor_layout_v3'

/**
 * Feature flag local pra UI v3 (cartão+drawer) com fallback pra clássica.
 *
 * Fontes (precedência):
 *   1. URL: ?ui=v3 ou ?ui=classic — vence sobre tudo (útil pra demonstrar)
 *   2. localStorage('ai_agent_editor_layout_v3') = 'true' | 'false'
 *   3. Default: true (UI v3 é a principal a partir de 2026-04-30)
 *
 * NÃO afeta dados nem comportamento da agente em produção. Só troca o componente
 * de renderização do cliente.
 */
export function useV3Layout(): {
  enabled: boolean
  toggle: () => void
  set: (value: boolean) => void
} {
  const [enabled, setEnabled] = useState<boolean>(() => readInitial())

  useEffect(() => {
    // Sincroniza com mudanças em outras abas (storage event)
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setEnabled(e.newValue === 'true')
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const set = useCallback((value: boolean) => {
    setEnabled(value)
    try {
      localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
    } catch {
      // Ignora se localStorage indisponível
    }
  }, [])

  const toggle = useCallback(() => set(!enabled), [enabled, set])

  return { enabled, toggle, set }
}

function readInitial(): boolean {
  // 1. URL param
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search)
      const ui = params.get('ui')
      if (ui === 'v3') return true
      if (ui === 'classic') return false
    } catch {
      // ignore
    }

    // 2. localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'true') return true
      if (stored === 'false') return false
    } catch {
      // ignore
    }
  }

  // 3. Default — UI v3 (default a partir de 2026-04-30).
  //    Quem quiser voltar pra clássica clica no botão "Voltar p/ clássica" no header.
  return true
}

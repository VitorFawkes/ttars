import { useEffect } from 'react'

/**
 * Faz <details> nativos (usados como dropdown de filtro) fecharem ao clicar FORA deles —
 * comportamento que o <details> nativo não tem (só fecha clicando de novo no próprio gatilho).
 *
 * Monte UMA vez num container alto (ex: layout). Enquanto montado, qualquer `<details open>` no
 * documento fecha quando o clique (mousedown) acontece fora dele. Clicar dentro do próprio
 * dropdown (inclusive no gatilho) não fecha — preserva o toggle manual e o multi-seleção.
 */
export function useCloseDetailsOnOutside() {
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      const openDetails = document.querySelectorAll<HTMLDetailsElement>('details[open]')
      openDetails.forEach(d => {
        if (!d.contains(target)) d.open = false
      })
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])
}

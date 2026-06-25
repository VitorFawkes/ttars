import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { STATUS_META, type BlocoStatus } from '../../lib/planejamento/statusBloco'

/**
 * Bloco colapsável da tela de Planejamento. Resolve a queixa "informação demais /
 * quero ocultar" (Vitor 25/06): cada seção vira uma gaveta com cabeçalho que se
 * lê num relance — ícone + título + bolinha de status (verde/amarelo/cinza/
 * vermelho) + resumo de 1 linha. O estado aberto/fechado fica salvo POR CASAMENTO.
 */
export function BlocoColapsavel({
  id,
  icon: Icon,
  titulo,
  status,
  resumo,
  defaultOpen = true,
  storageKey,
  children,
}: {
  id?: string
  icon: LucideIcon
  titulo: string
  status?: BlocoStatus
  /** Linha curta mostrada no cabeçalho (e quando fechado) — o "bater o olho". */
  resumo?: string
  defaultOpen?: boolean
  /** Chave pra persistir aberto/fechado (ex.: `${cardId}:local`). */
  storageKey?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (!storageKey) return defaultOpen
    try {
      const v = localStorage.getItem(`planej-bloco:${storageKey}`)
      return v == null ? defaultOpen : v === '1'
    } catch {
      return defaultOpen
    }
  })

  const toggle = () => {
    setOpen(prev => {
      const next = !prev
      if (storageKey) {
        try { localStorage.setItem(`planej-bloco:${storageKey}`, next ? '1' : '0') } catch { /* ignore */ }
      }
      return next
    })
  }

  const meta = status ? STATUS_META[status] : null

  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-[#E6DBC9] bg-white shadow-[0_1px_2px_rgba(78,24,32,0.04)] overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-[#FCFAF6] transition-colors"
      >
        <span className="relative w-9 h-9 rounded-xl bg-[#FBF6EC] ring-1 ring-[#EAD9BE] grid place-items-center shrink-0">
          <Icon className="w-[18px] h-[18px] text-[#B97F46]" />
          {meta && <span className={cn('absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white', meta.dot)} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[14.5px] font-bold text-[#211F1D] tracking-tight">{titulo}</h2>
            {meta && (
              <span className={cn('inline-flex items-center gap-1 h-[18px] px-1.5 rounded-full text-[10.5px] font-semibold', meta.chipBg, meta.chipText)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} /> {meta.label}
              </span>
            )}
          </div>
          {resumo && <p className="text-[12px] text-[#9A9082] mt-0.5 truncate [font-family:'Roboto']">{resumo}</p>}
        </div>
        <ChevronDown className={cn('w-[18px] h-[18px] text-[#B5ABA0] shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-[#F0E9DD]">{children}</div>}
    </section>
  )
}

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { LadoLabels } from '../../../lib/convidados/types'

interface Props {
  open: boolean
  labels: LadoLabels
  saving: boolean
  onSave: (labelA: string, labelB: string) => void
  onClose: () => void
}

/**
 * Ajuste discreto de como cada pessoa do casal aparece nos botões de "Lado".
 * Pré-preenchido com o que já está em uso (nomes derivados do nome do casal
 * ou Noiva/Noivo) — o casal só mexe se quiser.
 */
export function LadoNomesModal({ open, labels, saving, onSave, onClose }: Props) {
  const [a, setA] = useState(labels.noiva)
  const [b, setB] = useState(labels.noivo)

  // Re-sincroniza ao abrir (labels podem ter mudado desde a última edição)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) { setA(labels.noiva); setB(labels.noivo) } }, [open, labels.noiva, labels.noivo])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(a.trim(), b.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-xl border border-ww-sand shadow-lg p-5"
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-ww-serif italic text-lg text-ww-n700">Lados da lista</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-full text-ww-n400 hover:text-ww-n700 hover:bg-ww-cream transition-colors" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[12.5px] text-ww-n500 leading-relaxed mb-4">
          O "Lado" marca de quem é cada convidado. Ajuste aqui como cada um de vocês aparece nos botões.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-ww-n500 mb-1">Lado 1</span>
            <input
              value={a}
              onChange={(e) => setA(e.target.value)}
              maxLength={20}
              placeholder="Ex: Ana ou Noiva"
              className="w-full px-2.5 py-2 text-[14px] border border-ww-sand rounded-md focus:border-ww-gold focus:ring-2 focus:ring-ww-gold/30 focus:outline-none bg-white text-ww-n700"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-ww-n500 mb-1">Lado 2</span>
            <input
              value={b}
              onChange={(e) => setB(e.target.value)}
              maxLength={20}
              placeholder="Ex: Júlia ou Noivo"
              className="w-full px-2.5 py-2 text-[14px] border border-ww-sand rounded-md focus:border-ww-gold focus:ring-2 focus:ring-ww-gold/30 focus:outline-none bg-white text-ww-n700"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose}
            className="px-3 h-9 text-[13px] font-medium rounded-md border border-ww-sand-dk text-ww-n600 hover:bg-ww-cream transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving || !a.trim() || !b.trim()}
            className="px-4 h-9 text-[13px] font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

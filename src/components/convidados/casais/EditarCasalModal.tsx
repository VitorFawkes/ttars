import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { formatPhoneBR, isValidPhoneBR } from '../../../lib/convidados/formatPhoneBR'
import { useUpdateCasal } from '../../../hooks/convidados/casais/useCasalMutations'
import type { CasalAdminRow } from '../../../lib/convidados/types'

interface Props {
  open: boolean
  onClose: () => void
  casal: CasalAdminRow | null
}

export function EditarCasalModal({ open, onClose, casal }: Props) {
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const update = useUpdateCasal()

  useEffect(() => {
    if (open && casal) {
      setNome(casal.nome_casal); setWhatsapp(formatPhoneBR(casal.whatsapp_digits)); setErr(null)
    }
  }, [open, casal])

  if (!open || !casal) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return setErr('Informe o nome do casal')
    if (!isValidPhoneBR(whatsapp)) return setErr('Informe um WhatsApp válido')
    try {
      await update.mutateAsync({ casal_id: casal.id, nome_casal: nome.trim(), whatsapp })
      onClose()
    } catch (e) { setErr((e as Error).message) }
  }

  const node = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(33,31,29,0.42)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true">
      <form onSubmit={handleSubmit}
        className="w-full max-w-[480px] bg-white rounded-xl shadow-ww-modal flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-ww-sand">
          <h2 className="font-ww-serif italic text-lg text-ww-n700">Editar casal</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-ww-cream text-ww-n500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ww-n600">Nome do casal</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-ww-sand-dk rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-ww-gold/30 focus:border-ww-gold" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ww-n600">WhatsApp</span>
            <div className="flex items-stretch border border-ww-sand-dk rounded-md focus-within:ring-2 focus-within:ring-ww-gold/30 focus-within:border-ww-gold">
              <span className="inline-flex items-center px-2 text-xs text-ww-n500 border-r border-ww-sand-dk bg-ww-paper rounded-l-md">+55</span>
              <input value={whatsapp} onChange={(e) => setWhatsapp(formatPhoneBR(e.target.value))}
                className="flex-1 px-3 py-2 text-sm bg-transparent rounded-r-md focus:outline-none" />
            </div>
          </label>
          <p className="text-xs text-ww-n500">
            Código <code className="font-mono bg-ww-gold-soft text-ww-gold-ink px-1.5 py-0.5 rounded">{casal.codigo}</code> é fixo e não pode ser alterado.
          </p>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ww-sand">
          <button type="button" onClick={onClose} className="px-3 h-9 text-sm text-ww-n600 hover:text-ww-n700">Cancelar</button>
          <button type="submit" disabled={update.isPending}
            className={cn('inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink disabled:opacity-60 transition-colors')}>
            {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Salvar
          </button>
        </footer>
      </form>
    </div>
  )
  return createPortal(node, document.body)
}

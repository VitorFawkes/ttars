import { useState, type KeyboardEvent } from 'react'
import { Plus, X, Eraser, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from 'sonner'
import { useSofiaPhoneWhitelist } from '@/hooks/wsdr/useSofiaPhoneWhitelist'
import { useSofiaResetConversation } from '@/hooks/wsdr/useSofiaResetConversation'

function formatPhone(p: string): string {
  const d = p.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return d
}

// "Quem pode falar com a Sofia" — whitelist de números. Conteúdo do card (o
// cabeçalho vem do EditorCard no SofiaEditor). Vazio = ela não responde ninguém.
export function WhoCanTalkEditor({ slug = 'sofia-weddings' }: { slug?: string }) {
  const { whitelist, isLoading, save, isSaving } = useSofiaPhoneWhitelist(slug)
  const [novo, setNovo] = useState('')

  const adicionar = async () => {
    const limpo = novo.replace(/\D/g, '')
    if (limpo.length < 10) {
      toast.error('Número muito curto. Inclua o DDD (ex: 11 99999-9999).')
      return
    }
    if (whitelist.includes(limpo)) {
      toast.info('Esse número já está na lista.')
      setNovo('')
      return
    }
    try {
      await save([...whitelist, limpo])
      setNovo('')
      toast.success(`${formatPhone(limpo)} adicionado.`)
    } catch (err) {
      toast.error(`Não consegui salvar: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const remover = async (phone: string) => {
    if (!confirm(`Tirar ${formatPhone(phone)} da lista? A Sofia para de responder esse número.`)) return
    try {
      await save(whitelist.filter(p => p !== phone))
      toast.success('Removido.')
    } catch (err) {
      toast.error(`Não consegui salvar: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const limparTudo = async () => {
    if (!whitelist.length) return
    if (!confirm('Zerar a lista? A Sofia fica sem responder NINGUÉM até você adicionar um número de novo.')) return
    try {
      await save([])
      toast.success('Lista zerada. A Sofia não responde ninguém agora.')
    } catch (err) {
      toast.error(`Não consegui salvar: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); adicionar() }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={novo}
          onChange={e => setNovo(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ex: (11) 96429-3533"
          disabled={isSaving}
          className="flex-1"
        />
        <Button onClick={adicionar} disabled={isSaving || !novo.trim()}
          className="gap-1.5 bg-ww-gold hover:bg-ww-gold-ink text-white shrink-0 active:scale-[0.98] transition-transform">
          <Plus className="w-4 h-4" /> Adicionar
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-ww-n400">Carregando lista…</p>
      ) : whitelist.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-7 px-4 rounded-xl border border-dashed border-ww-sand bg-ww-cream/40">
          <ShieldCheck className="w-5 h-5 text-ww-olive-ink mb-2" />
          <p className="text-sm text-ww-n600 font-medium">A Sofia não responde ninguém.</p>
          <p className="text-xs text-ww-n400 mt-0.5 max-w-xs">Enquanto a lista estiver vazia, qualquer mensagem é ignorada. Adicione pelo menos o seu número pra testar com segurança.</p>
        </div>
      ) : (
        <ul className="divide-y divide-ww-sand/70 border border-ww-sand rounded-xl overflow-hidden bg-white">
          {whitelist.map(p => (
            <li key={p} className="flex items-center justify-between px-4 py-2.5 hover:bg-ww-cream/50 transition-colors">
              <div>
                <p className="text-sm font-medium text-ww-n700">{formatPhone(p)}</p>
                <p className="text-[11px] text-ww-n400 font-mono">{p}</p>
              </div>
              <button type="button" onClick={() => remover(p)} disabled={isSaving}
                className="text-ww-n400 hover:text-ww-error p-1.5 rounded-lg hover:bg-ww-error/10 transition-colors" title="Remover número">
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {whitelist.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-ww-n400">{whitelist.length} número{whitelist.length > 1 ? 's' : ''} autorizado{whitelist.length > 1 ? 's' : ''}.</p>
          <button type="button" onClick={limparTudo} disabled={isSaving}
            className="text-xs text-ww-n400 hover:text-ww-error transition-colors">Zerar lista</button>
        </div>
      )}
    </div>
  )
}

// "Zerar conversa pra começar do zero" — apaga a memória da Sofia com um número.
export function ResetConversationEditor({ slug = 'sofia-weddings' }: { slug?: string }) {
  const [phone, setPhone] = useState('')
  const [confirming, setConfirming] = useState(false)
  const reset = useSofiaResetConversation(slug)

  const digits = phone.replace(/\D/g, '')
  const canSubmit = digits.length >= 10

  const handleReset = async () => {
    if (!canSubmit) return
    try {
      const r = await reset.mutateAsync(phone)
      if (!r.ok) {
        toast.error(r.reason === 'telefone curto' ? 'Número muito curto.' : 'Não consegui zerar. Tenta de novo.')
        return
      }
      const apagou = (r.state_deleted ?? 0) + (r.buffer_deleted ?? 0) + (r.messages_deleted ?? 0) + (r.cards_cleared ?? 0) + (r.contacts_cleared ?? 0)
      toast.success(apagou > 0 ? 'Conversa zerada. A Sofia trata esse número como um lead novo.' : 'Nada pra apagar — já estava do zero.')
      setConfirming(false)
      setPhone('')
    } catch (err) {
      console.error('[ResetConversationEditor]', err)
      toast.error('Não consegui zerar. Tenta de novo.')
    }
  }

  return (
    <div className="space-y-3">
      <Input
        type="tel"
        placeholder="Número que você quer zerar (ex: 11 96429-3533)"
        value={phone}
        onChange={e => { setPhone(e.target.value); setConfirming(false) }}
        disabled={reset.isPending}
      />
      {!confirming ? (
        <Button type="button" variant="outline" onClick={() => setConfirming(true)} disabled={!canSubmit}
          className="gap-2 text-ww-error border-ww-error/30 hover:bg-ww-error/10">
          <Eraser className="w-4 h-4" /> Zerar conversa com este número
        </Button>
      ) : (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-amber-800 font-medium">Zerar tudo com {formatPhone(phone)}?</p>
            <p className="text-xs text-amber-700 mt-1">Apaga a conversa, o histórico de mensagens e os dados que a Sofia guardou no card desse número — ela passa a tratar como um lead totalmente novo. Não dá pra desfazer.</p>
            <div className="flex gap-2 mt-3">
              <Button onClick={handleReset} disabled={reset.isPending} size="sm" className="gap-2 bg-ww-error hover:bg-ww-error/90 text-white">
                {reset.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}
                {reset.isPending ? 'Zerando…' : 'Sim, zerar'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={reset.isPending}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

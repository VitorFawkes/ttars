import { useMemo, useState } from 'react'
import { ExternalLink, Send, Users, Info } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { useCardContactNames } from '../../hooks/useCardContactNames'
import { WhatsAppHistory } from '../card/WhatsAppHistory'

// Conversa de WhatsApp do casamento — a MESMA lógica do Trips (Echo): as
// mensagens vivem em whatsapp_messages, chegam sozinhas pelo webhook e são
// ligadas ao card pelos telefones do casal (e ao GRUPO via whatsapp_groups).
// Aqui a gente só organiza em abas: Tudo · cada pessoa do casal · Grupo.

type Aba = { key: string; label: string; filter: { contactId?: string | null; groupOnly?: boolean } | null }

export function ConversaCasamentoSection({ cardId }: { cardId: string }) {
  const { data: contactNames } = useCardContactNames(cardId)
  const [abaAtiva, setAbaAtiva] = useState('tudo')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)

  const pessoas = useMemo(
    () =>
      Object.entries(contactNames ?? {})
        .map(([id, info]) => ({ id, nome: info.nome, role: info.role }))
        .sort((a, b) => (a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0)),
    [contactNames],
  )

  const abas: Aba[] = useMemo(() => {
    const list: Aba[] = [{ key: 'tudo', label: 'Tudo', filter: null }]
    for (const p of pessoas) {
      list.push({ key: p.id, label: p.nome.split(' ')[0], filter: { contactId: p.id } })
    }
    list.push({ key: 'grupo', label: 'Grupo', filter: { groupOnly: true } })
    return list
  }, [pessoas])

  const aba = abas.find((a) => a.key === abaAtiva) ?? abas[0]

  // destino do envio: a pessoa da aba ativa, senão o contato principal
  const destino = pessoas.find((p) => p.id === abaAtiva) ?? pessoas[0] ?? null

  const enviar = async () => {
    const corpo = mensagem.trim()
    if (!corpo || !destino) return
    setEnviando(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: { contact_id: destino.id, card_id: cardId, corpo, source: 'manual' },
      })
      if (error) throw error
      const err = (data as { error?: string } | null)?.error
      if (err) throw new Error(err)
      setMensagem('')
      toast.success(`Mensagem enviada para ${destino.nome.split(' ')[0]}.`)
    } catch (e) {
      toast.error(`Não consegui enviar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEnviando(false)
    }
  }

  const abrirEcho = async () => {
    const win = window.open('about:blank', '_blank')
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.rpc as any)('resolve_whatsapp_target_for_card', { p_card_id: cardId })
      const url = data && typeof data === 'object' && 'url' in data ? (data as { url: string }).url : null
      if (url && win) win.location.href = url
      else { win?.close(); toast.message('Ainda não há conversa no Echo pra este casamento.') }
    } catch {
      win?.close()
      toast.error('Não consegui abrir o painel do Echo.')
    }
  }

  if (pessoas.length === 0) {
    return (
      <p className="text-[12.5px] text-slate-400 italic pt-3">
        Cadastre o casal (bloco Casal) com telefone — as conversas de WhatsApp aparecem aqui sozinhas.
      </p>
    )
  }

  return (
    <div className="pt-3 flex flex-col gap-3">
      {/* Abas: Tudo · noiva · noivo · Grupo */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {abas.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setAbaAtiva(a.key)}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[12.5px] font-medium transition-colors',
              abaAtiva === a.key
                ? 'bg-[#FBF6E8] border-[#E6D3B3] text-[#8A6A33]'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50',
            )}
          >
            {a.key === 'grupo' && <Users className="w-3.5 h-3.5" />}
            {a.label}
          </button>
        ))}
        <button
          type="button"
          onClick={abrirEcho}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E0D6C8] bg-white text-[12px] font-semibold text-[#5C5751] hover:bg-[#FCFAF6]"
        >
          Abrir no Echo <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Conversa (mesma infra do Trips) */}
      <div className="h-[480px] rounded-xl border border-[#EEE7DA] bg-white overflow-hidden">
        <WhatsAppHistory contactId={pessoas[0]?.id ?? null} cardId={cardId} viewFilter={aba.filter} />
      </div>

      {/* Composer — envia pela linha configurada (Echo). */}
      <div className="flex items-end gap-2 rounded-xl border border-[#EEE7DA] bg-[#FBF9F5] p-2.5">
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar() }}
          rows={2}
          placeholder={destino ? `Mensagem para ${destino.nome.split(' ')[0]}…` : 'Mensagem…'}
          className="flex-1 px-3 py-2 border border-[#E0D6C8] rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#BD965C]/30 focus:border-[#BD965C] resize-none"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!mensagem.trim() || !destino || enviando}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] text-[13px] font-semibold bg-[#BD965C] text-white hover:bg-[#a37f47] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Send className="w-[14px] h-[14px]" /> {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>

      <div className="flex items-start gap-2 text-[11.5px] text-[#9A8F7B] bg-[#FCF9F2] border border-[#EEE0C8] rounded-lg px-3 py-2">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          As mensagens chegam aqui sozinhas quando o <b>telefone</b> de cada pessoa está no cadastro do casal.
          O <b>grupo</b> do WhatsApp com os dois é reconhecido automaticamente na primeira mensagem de alguém do casal.
          A linha (número) usada pra enviar é a configurada pra Weddings — dá pra trocar depois.
        </span>
      </div>
    </div>
  )
}

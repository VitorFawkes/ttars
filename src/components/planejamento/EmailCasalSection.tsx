import { useState } from 'react'
import { Mail, Send, Info } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useCardEmails } from '../../hooks/planejamento/useCardEmails'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'

const CARD = 'bg-white border border-[#EAE1D3] rounded-2xl p-5 shadow-[0_1px_2px_rgba(78,24,32,0.05)]'
const FIELD = 'w-full px-3 py-2 border border-[#E0D6C8] rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#BD965C]/30 focus:border-[#BD965C]'

function fmt(iso: string | null): string {
  if (!iso) return ''
  const d = iso.slice(0, 10)
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${iso.slice(11, 16)}`
}

/**
 * E-mail com o casal (D-P6) — toda a troca por e-mail dentro do casamento, num
 * lugar só. Reusa a tabela nativa `mensagens` + a edge function send-email.
 * Enquanto o provedor não estiver ligado, registra mas não envia de verdade
 * (avisa "modo de teste"). Caixa de entrada (responder dali) = próxima etapa.
 */
export function EmailCasalSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { emails, send } = useCardEmails(wedding.id)
  const [para, setPara] = useState('')
  const [assunto, setAssunto] = useState('')
  const [mensagem, setMensagem] = useState('')

  const canSend = para.trim().length > 3 && assunto.trim().length > 0 && mensagem.trim().length > 0
  const algumTeste = emails.some((e) => e.metadados && (e.metadados as { dry_run?: boolean }).dry_run)

  const handleSend = () => {
    if (!canSend) return
    send.mutate(
      { to: para.trim(), assunto: assunto.trim(), mensagem: mensagem.trim() },
      { onSuccess: () => { setMensagem('') } },
    )
  }

  return (
    <section className={CARD}>
      <header className="flex items-center gap-2 mb-1">
        <Mail className="w-5 h-5 text-[#BD965C]" />
        <h2 className="text-base font-semibold text-slate-900">E-mail com o casal</h2>
        {emails.length > 0 && <span className="text-[11px] text-slate-500 tabular-nums">{emails.length}</span>}
      </header>
      <p className="text-[12px] text-[#9A9082] mb-4 [font-family:'Roboto',sans-serif]">
        A conversa formal por e-mail, dentro do casamento. (Receber e responder de dentro do card vem na próxima etapa.)
      </p>

      {/* Thread */}
      {emails.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {emails.map((e) => (
            <div
              key={e.id}
              className={cn(
                'rounded-xl border px-3.5 py-2.5 text-[13px]',
                e.lado === 'out' ? 'border-[#E6D3B3] bg-[#FCF9F2] self-end max-w-[88%]' : 'border-slate-200 bg-slate-50 self-start max-w-[88%]',
              )}
            >
              <div className="flex items-center justify-between gap-3 mb-0.5">
                <span className="text-[10.5px] font-bold uppercase tracking-wide text-[#A88C57]">{e.lado === 'out' ? 'Você' : 'Casal'}</span>
                <span className="text-[10.5px] text-slate-400 tabular-nums">{fmt(e.data_hora)}</span>
              </div>
              {e.assunto && <div className="font-semibold text-[#3A3633]">{e.assunto}</div>}
              <div className="text-[#5C5751] whitespace-pre-wrap break-words">{e.conteudo}</div>
              {e.metadados && (e.metadados as { dry_run?: boolean }).dry_run && (
                <div className="text-[10.5px] text-amber-600 mt-1">· registrado, não enviado de verdade (modo de teste)</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="flex flex-col gap-2 rounded-xl border border-[#EEE7DA] bg-[#FBF9F5] p-3">
        <input value={para} onChange={(e) => setPara(e.target.value)} placeholder="Para (e-mail do casal)" className={FIELD} type="email" />
        <input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Assunto" className={FIELD} />
        <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Escreva o e-mail…" rows={4} className={FIELD} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[#B5ABA0]">Fica registrado no histórico do casamento.</span>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend || send.isPending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[13px] font-semibold bg-[#BD965C] text-white hover:bg-[#a37f47] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-[14px] h-[14px]" /> {send.isPending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>

      {algumTeste && (
        <div className="mt-3 flex items-start gap-2 text-[11.5px] text-[#9A7B2E] bg-[#FDF3E7] border border-[#f0d8b4] rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>O <b>envio de verdade ainda não está ligado</b> — falta configurar o provedor de e-mail. Por enquanto os e-mails ficam registrados aqui, mas não saem. Me avisa quando quiser que eu ligue o envio.</span>
        </div>
      )}
    </section>
  )
}

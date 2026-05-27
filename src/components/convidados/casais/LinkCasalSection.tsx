import { useMemo, useState } from 'react'
import {
  Link2,
  Copy,
  Send,
  ExternalLink,
  Plus,
  CheckCircle2,
  AlertCircle,
  Unlink,
  Loader2,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useCasais } from '../../../hooks/convidados/casais/useCasais'
import { useDesvincularCasalDoCard } from '../../../hooks/convidados/casais/useCasalMutations'
import { formatPhoneBR } from '../../../lib/convidados/formatPhoneBR'
import { buildLinkCasal, buildWhatsappLink } from '../../../lib/convidados/buildLink'
import { NovoCasalModal } from './NovoCasalModal'

interface Props {
  cardId: string
  cardTitulo: string
}

/**
 * Seção para renderizar dentro de CasamentoDetailPage. Mostra o link do
 * casal (se existir um casal vinculado), ou um CTA para gerar.
 */
export function LinkCasalSection({ cardId, cardTitulo }: Props) {
  const { data: casais = [], isLoading } = useCasais()
  const desvincular = useDesvincularCasalDoCard()
  const [showCriar, setShowCriar] = useState(false)
  const [copied, setCopied] = useState(false)

  const casal = useMemo(
    () => casais.find((c) => c.card_id === cardId && !c.encerrado_em),
    [casais, cardId],
  )

  const link = casal ? buildLinkCasal(casal.codigo) : null
  const wa = casal ? buildWhatsappLink(casal.whatsapp_digits, casal.codigo) : null

  const handleCopy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // ignore
    }
  }

  if (isLoading) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <header className="flex items-center gap-2 mb-2">
          <Link2 className="w-5 h-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Link do casal</h2>
        </header>
        <p className="text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Verificando…
        </p>
      </section>
    )
  }

  if (!casal) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <header className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">Link do casal</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 uppercase">
              <AlertCircle className="w-3 h-3" /> Sem link
            </span>
          </div>
        </header>
        <p className="text-sm text-slate-600 mb-3">
          Gere um link único para o casal preencher a própria lista de convidados.
          Eles abrem pelo WhatsApp e preenchem; o resultado aparece direto aqui no
          Kanban abaixo.
        </p>
        <button
          type="button"
          onClick={() => setShowCriar(true)}
          className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Gerar link do casal
        </button>

        <NovoCasalModal
          open={showCriar}
          onClose={() => setShowCriar(false)}
          defaultCardId={cardId}
          defaultCardTitulo={cardTitulo}
        />
      </section>
    )
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <header className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Link do casal</h2>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
            <CheckCircle2 className="w-3 h-3" /> Vinculado
          </span>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (confirm('Desvincular este link do casamento? O link continua ativo, mas as pessoas não aparecem mais neste card.')) {
              await desvincular.mutateAsync(casal.id)
            }
          }}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md"
        >
          <Unlink className="w-3.5 h-3.5" /> Desvincular
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <Field label="Casal">
          <p className="text-sm font-medium text-slate-900">{casal.nome_casal}</p>
        </Field>
        <Field label="Código">
          <code className="font-mono text-sm bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
            {casal.codigo}
          </code>
        </Field>
        <Field label="WhatsApp">
          <p className="text-sm text-slate-900">+55 {formatPhoneBR(casal.whatsapp_digits)}</p>
        </Field>
        <Field label="Última edição">
          <p className="text-sm text-slate-700">
            {casal.ultima_edicao_casal_em
              ? new Date(casal.ultima_edicao_casal_em).toLocaleString('pt-BR')
              : 'Ainda não preenchido'}
          </p>
        </Field>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 mb-3 flex items-center gap-2">
        <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <code className="font-mono text-xs text-slate-700 truncate flex-1">{link}</code>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-medium rounded-md border transition-colors',
            copied
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
          )}
        >
          {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiado!' : 'Copiar link'}
        </button>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-medium rounded-md bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Enviar WhatsApp
          </a>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Abrir lista
          </a>
        )}
        <div className="ml-auto inline-flex items-center gap-3 text-xs">
          <Counter n={casal.total_convites} label="convites" />
          <Counter n={casal.total_pessoas} label="convidados" accent />
          {casal.pessoas_sem_telefone > 0 && (
            <Counter n={casal.pessoas_sem_telefone} label="sem telefone" warn />
          )}
        </div>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      {children}
    </div>
  )
}

function Counter({
  n,
  label,
  accent,
  warn,
}: {
  n: number
  label: string
  accent?: boolean
  warn?: boolean
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <strong
        className={cn(
          'tabular-nums font-semibold',
          warn ? 'text-rose-600' : accent ? 'text-indigo-700' : 'text-slate-900',
        )}
      >
        {n}
      </strong>
      <span className="text-slate-500 text-[11px]">{label}</span>
    </span>
  )
}

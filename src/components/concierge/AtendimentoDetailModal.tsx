import { useState } from 'react'
import { X, AlertCircle, ExternalLink, Calendar, Wallet, Phone, Mail, Users as UsersIcon, MessageCircle, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMarcarOutcome, useNotificarCliente } from '../../hooks/concierge/useAtendimentoMutations'
import { TIPO_LABEL, SOURCE_LABEL, CATEGORIAS_CONCIERGE, type MeuDiaItem, type OutcomeConcierge, type CobradoDe } from '../../hooks/concierge/types'
import { useCardPeople, type CardPerson } from '../../hooks/useCardPeople'
import { useCardObservacoes, flattenObservacoes } from '../../hooks/concierge/useCardObservacoes'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { cn } from '../../lib/utils'

interface AtendimentoDetailModalProps {
  item?: MeuDiaItem
  atendimento?: MeuDiaItem
  isOpen?: boolean
  open?: boolean
  onClose?: () => void
  onOpenChange?: (open: boolean) => void
}

const OUTCOME_OPTIONS: { value: OutcomeConcierge; label: string; tone: string }[] = [
  { value: 'aceito',    label: 'Aceito',    tone: 'border-purple-300 bg-purple-50 text-purple-700' },
  { value: 'feito',     label: 'Feito',     tone: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 'recusado',  label: 'Recusado',  tone: 'border-red-300 bg-red-50 text-red-700' },
  { value: 'cancelado', label: 'Cancelado', tone: 'border-slate-300 bg-slate-50 text-slate-700' },
]

function fmtBRL(v: number | null | undefined) {
  if (v == null) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function ageFromDate(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const today = new Date()
  let years = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) years--
  return years
}

function fullName(p: CardPerson) {
  return [p.nome, p.sobrenome].filter(Boolean).join(' ') || 'Sem nome'
}

function whatsappUrl(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return null
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${withCountry}`
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return phone
}

export function AtendimentoDetailModal(props: AtendimentoDetailModalProps) {
  const item = (props.item ?? props.atendimento) as MeuDiaItem | undefined
  const isOpen = props.open ?? props.isOpen ?? false
  const onClose = () => { props.onClose?.(); props.onOpenChange?.(false) }
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeConcierge | null>((item?.outcome as OutcomeConcierge) ?? null)
  const [valorFinal, setValorFinal] = useState(item?.valor?.toString() ?? '')
  const [cobradoDe, setCobradoDe] = useState<CobradoDe | ''>(item?.cobrado_de ?? '')
  const [observacao, setObservacao] = useState('')

  const { mutate: marcarOutcome, isPending: isMarkingOutcome } = useMarcarOutcome()
  const { mutate: notificarCliente, isPending: isNotifying } = useNotificarCliente()

  const { primary, travelers } = useCardPeople(item?.card_id)
  const { data: observacoes } = useCardObservacoes(item?.card_id)
  const obsEntries = flattenObservacoes(observacoes)

  if (!item) return null
  if (!isOpen) return null

  const isVencido = item.status_apresentacao === 'vencido'
  const tipoMeta = TIPO_LABEL[item.tipo_concierge]
  const sourceLabel = SOURCE_LABEL[item.source].label
  const cat = CATEGORIAS_CONCIERGE[item.categoria as keyof typeof CATEGORIAS_CONCIERGE]
  const catLabel = cat?.label ?? item.categoria
  const titulo = item.titulo?.trim() || catLabel

  const handleMarcarOutcome = () => {
    if (!selectedOutcome) return
    marcarOutcome({
      atendimento_id: item.atendimento_id,
      outcome: selectedOutcome,
      valor_final: valorFinal ? parseFloat(valorFinal) : null,
      cobrado_de: cobradoDe ? (cobradoDe as CobradoDe) : null,
      observacao: observacao ?? null,
    }, {
      onSuccess: () => onClose(),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex items-start gap-3">
          <span className={cn('shrink-0 w-1 h-10 rounded-full', tipoMeta.dotColor)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide font-semibold mb-0.5">
              <span className={tipoMeta.color}>{tipoMeta.label}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">{catLabel}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-400">{sourceLabel}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 leading-snug truncate">{titulo}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {isVencido && item.data_vencimento && (
            <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-semibold text-red-900">Atendimento vencido</span>
                <span className="text-red-700 ml-1">há {formatDistanceToNow(new Date(item.data_vencimento), { locale: ptBR })}</span>
              </div>
            </div>
          )}

          <ViagemBlock item={item} onClose={onClose} />

          {primary && <ClientePrincipalBlock person={primary} />}

          {travelers.length > 0 && <ViajantesBlock travelers={travelers} primaryId={primary?.id ?? null} />}

          {obsEntries.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-amber-200 flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5" />
                Observações importantes
              </div>
              <ul className="p-3 space-y-1.5">
                {obsEntries.map((e, i) => (
                  <li key={`${e.source}-${e.key}-${i}`} className="text-[12.5px] text-amber-900 leading-snug">
                    <span className="font-semibold">{e.label}:</span> <span className="text-slate-800">{e.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.descricao && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[13px] text-slate-700 leading-relaxed">
              {item.descricao}
            </div>
          )}

          {!item.outcome ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">Marcar como</div>
                <div className="grid grid-cols-4 gap-2">
                  {OUTCOME_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedOutcome(opt.value)}
                      className={cn(
                        'p-2 rounded-lg border-2 transition-all text-[12.5px] font-semibold',
                        selectedOutcome === opt.value
                          ? opt.tone
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {item.tipo_concierge === 'oferta' && (selectedOutcome === 'aceito' || selectedOutcome === 'feito') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11.5px] font-semibold text-slate-700 mb-1">Valor final</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                      <Input
                        type="number"
                        placeholder="0"
                        value={valorFinal}
                        onChange={(e) => setValorFinal(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-semibold text-slate-700 mb-1">Cobrado de</label>
                    <select
                      value={cobradoDe}
                      onChange={(e) => setCobradoDe(e.target.value as CobradoDe)}
                      className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                    >
                      <option value="">Selecionar…</option>
                      <option value="cliente">Cliente</option>
                      <option value="cortesia">Cortesia</option>
                      <option value="incluido_pacote">Incluído no pacote</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11.5px] font-semibold text-slate-700 mb-1">
                  Observação <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <textarea
                  placeholder="Anotações sobre este atendimento…"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 resize-none"
                  rows={2}
                />
              </div>
            </div>
          ) : (
            <div className={cn(
              'p-3 rounded-lg border text-sm flex items-center justify-between gap-3',
              item.outcome === 'aceito'    && 'bg-purple-50 border-purple-200 text-purple-700',
              item.outcome === 'feito'     && 'bg-emerald-50 border-emerald-200 text-emerald-700',
              item.outcome === 'recusado'  && 'bg-red-50 border-red-200 text-red-700',
              item.outcome === 'cancelado' && 'bg-slate-50 border-slate-200 text-slate-700',
            )}>
              <div>
                <span className="text-[11px] uppercase tracking-wide font-semibold opacity-70">Finalizado</span>
                <div className="font-semibold capitalize">{item.outcome}</div>
              </div>
              {item.outcome_em && (
                <div className="text-[11px] opacity-70">
                  {new Date(item.outcome_em).toLocaleString('pt-BR')}
                </div>
              )}
            </div>
          )}

          <div className="text-[10.5px] text-slate-400 flex items-center gap-2 pt-2 border-t border-slate-100">
            <span>Criado {formatDistanceToNow(new Date(item.atendimento_criado_em), { locale: ptBR, addSuffix: true })}</span>
            {item.notificou_cliente_em && (
              <>
                <span className="text-slate-300">·</span>
                <span>Cliente notificado {formatDistanceToNow(new Date(item.notificou_cliente_em), { locale: ptBR, addSuffix: true })}</span>
              </>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-3 flex items-center justify-end gap-2">
          {!item.outcome ? (
            <>
              <Button variant="ghost" onClick={onClose} disabled={isMarkingOutcome}>Fechar</Button>
              {!item.notificou_cliente_em && (
                <Button
                  variant="outline"
                  onClick={() => notificarCliente(item.atendimento_id)}
                  disabled={isNotifying}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Notificar cliente
                </Button>
              )}
              <Button onClick={handleMarcarOutcome} disabled={!selectedOutcome || isMarkingOutcome}>
                {isMarkingOutcome ? 'Salvando…' : 'Confirmar'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ViagemBlock({ item, onClose }: { item: MeuDiaItem; onClose: () => void }) {
  const valor = item.card_valor_final ?? item.card_valor_estimado
  return (
    <div className="bg-indigo-50/40 border border-indigo-100 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-indigo-100 flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide font-semibold text-indigo-700 flex items-center gap-1.5">
          Viagem
        </div>
        <Link
          to={`/cards/${item.card_id}`}
          onClick={onClose}
          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-indigo-600 hover:text-indigo-700"
        >
          Abrir card completo <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <div className="p-3 space-y-2">
        <div className="font-semibold text-slate-900 leading-snug">{item.card_titulo}</div>
        <div className="flex items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-700 flex-wrap">
          <span className="font-mono uppercase tracking-wide text-[11px] text-slate-500">{item.produto?.toUpperCase()}</span>
          {item.data_viagem_inicio && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono">
                {new Date(item.data_viagem_inicio).toLocaleDateString('pt-BR')}
                {item.data_viagem_fim && ` – ${new Date(item.data_viagem_fim).toLocaleDateString('pt-BR')}`}
              </span>
            </span>
          )}
          {item.dias_pra_embarque !== null && (
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 rounded font-mono text-[11.5px] font-semibold',
              item.dias_pra_embarque < 0 ? 'bg-slate-100 text-slate-600' :
              item.dias_pra_embarque <= 2 ? 'bg-red-50 text-red-700' :
              item.dias_pra_embarque <= 7 ? 'bg-amber-50 text-amber-700' :
              'bg-slate-50 text-slate-600'
            )}>
              {item.dias_pra_embarque < 0
                ? `Já voltou há ${-item.dias_pra_embarque}d`
                : item.dias_pra_embarque === 0
                ? 'Embarca hoje'
                : `Embarca em ${item.dias_pra_embarque}d`}
            </span>
          )}
          {valor != null && valor > 0 && (
            <span className="inline-flex items-center gap-1 text-slate-700">
              <Wallet className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono font-semibold">{fmtBRL(valor)}</span>
              {item.card_valor_final == null && <span className="text-[10.5px] text-slate-400 italic">(estimado)</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function ClientePrincipalBlock({ person }: { person: CardPerson }) {
  const phone = formatPhone(person.telefone)
  const wa = whatsappUrl(person.telefone)
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 text-[11px] uppercase tracking-wide font-semibold text-slate-500">
        Cliente principal
      </div>
      <div className="p-3 space-y-2">
        <div className="font-semibold text-slate-900">{fullName(person)}</div>
        <div className="flex items-center gap-2 flex-wrap">
          {person.telefone && (
            <>
              <a
                href={`tel:${person.telefone}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-[12px] text-slate-700 transition"
              >
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono">{phone}</span>
              </a>
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[12px] text-emerald-700 font-medium transition"
                  title="Abrir conversa no WhatsApp"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              )}
            </>
          )}
          {person.email && (
            <a
              href={`mailto:${person.email}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-[12px] text-slate-700 transition"
            >
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              {person.email}
            </a>
          )}
          {!person.telefone && !person.email && (
            <span className="text-[12px] text-slate-400 italic">Sem telefone ou email cadastrado</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ViajantesBlock({ travelers, primaryId }: { travelers: CardPerson[]; primaryId: string | null }) {
  // Inclui o primary no count total mas lista só os travelers ainda não-primary
  const list = travelers.filter(t => t.id !== primaryId)
  const totalCount = list.length + (primaryId ? 1 : 0)
  if (list.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 text-[11px] uppercase tracking-wide font-semibold text-slate-500 flex items-center gap-1.5">
        <UsersIcon className="w-3.5 h-3.5" />
        Outros viajantes
        <span className="ml-auto font-mono normal-case text-[10.5px] text-slate-400">{totalCount} pessoas no grupo</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {list.map(p => {
          const idade = ageFromDate(null) // contatos não tem data_nascimento direto na interface CardPerson
          return (
            <li key={p.id} className="px-3 py-2 flex items-center gap-2 text-[12.5px]">
              <span className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                p.tipo_pessoa === 'crianca' ? 'bg-pink-400' : 'bg-slate-300'
              )} />
              <span className="font-medium text-slate-800 truncate flex-1">{fullName(p)}</span>
              <span className="text-[10.5px] uppercase tracking-wide text-slate-400 shrink-0">
                {p.tipo_pessoa === 'crianca' ? 'criança' : 'adulto'}
                {idade !== null && ` · ${idade}a`}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

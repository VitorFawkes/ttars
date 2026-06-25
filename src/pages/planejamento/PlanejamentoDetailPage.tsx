import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CalendarCheck,
  Globe,
  ExternalLink,
  Loader2,
  Heart,
  Hourglass,
  Pencil,
  Check,
  X,
  Lock,
  Clock,
  AlarmClock,
  ChevronRight,
  Bell,
  Paperclip,
  MapPin,
  BedDouble,
  Coins,
  Receipt,
  History,
  Megaphone,
  Users,
  StickyNote,
  Scale,
  Mail,
  BarChart3,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { getTaskTypeConfig } from '../../components/tasks/taskTypeConfig'
import './champagne.css'
import { formatDataLonga, daysUntil, addDaysIso } from '../../lib/planejamento/format'
import { usePlanejamentoWeddings } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { useWeddingChecklist } from '../../hooks/planejamento/useWeddingChecklist'
import { useWeddingPlanningPrazo } from '../../hooks/planejamento/useWeddingPlanningPrazo'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'
import { AvancarEtapaBar } from '../../components/planejamento/AvancarEtapaBar'
import { RelatorioCasamento } from '../../components/planejamento/RelatorioCasamento'
import { faixaDeSaude, STATUS_META } from '../../lib/planejamento/statusBloco'
import { CasalSection } from '../../components/planejamento/CasalSection'
import { WeddingEquipeSection } from '../../components/planejamento/WeddingEquipeSection'
import { LocalCerimoniaBody, HospedagemBloqueioBody } from '../../components/planejamento/LocalHospedagemSection'
import { ComissionamentoSection } from '../../components/planejamento/ComissionamentoSection'
import { TarifasPoliticasSection } from '../../components/planejamento/TarifasPoliticasSection'
import { BlocoColapsavel } from '../../components/planejamento/BlocoColapsavel'
import { CronogramaSpine } from '../../components/planejamento/CronogramaSpine'
import { DecisoesSection } from '../../components/planejamento/DecisoesSection'
import { EmailCasalSection } from '../../components/planejamento/EmailCasalSection'
import ActivityFeed from '../../components/card/ActivityFeed'
import AttachmentsWidget from '../../components/card/attachments/AttachmentsWidget'
import {
  AcaoPromoSection,
  ConvidadosResumoSection,
  NotasSection,
} from '../../components/planejamento/PlanejamentoSections'
import {
  PLANEJAMENTO_LABEL,
  PLANEJAMENTO_ORDER,
  PLANEJ_FIELD,
  BLOCO,
} from '../../hooks/planejamento/types'

// Tema champanhe (design do Vitor no Claude Design) — paleta em champagne.css
const CHAMP_PAGE = "planej-champ min-h-screen bg-[#EAE2D5] px-6 py-5"

function pdStr(pd: Record<string, unknown> | null, key: string): string {
  if (!pd) return ''
  const v = pd[key]
  return v == null ? '' : String(v)
}
function pdNum(pd: Record<string, unknown> | null, key: string): number | null {
  const s = pdStr(pd, key)
  if (!s) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isNaN(n) ? null : n
}
const brlK = (v: number) => v >= 1000 ? `R$ ${Math.round(v / 1000)}k` : `R$ ${v}`

export default function PlanejamentoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const cardId = id ?? null

  const { data, isLoading, isError } = usePlanejamentoWeddings()
  const wedding = data.find(w => w.id === cardId) ?? null
  const checklist = useWeddingChecklist(cardId)
  const { defaultDias } = useWeddingPlanningPrazo()
  const campos = usePlanejamentoCampos()
  const [editandoPrazo, setEditandoPrazo] = useState(false)
  const [docsOpen, setDocsOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="px-6 py-8 flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando casamento…
      </div>
    )
  }

  if (isError || !wedding) {
    return (
      <div className="px-6 py-8">
        <button onClick={() => navigate('/planejamento')} className="text-sm text-indigo-600 hover:underline mb-4">
          ← Voltar
        </button>
        <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">
          Não consegui carregar este casamento no planejamento.
        </div>
      </div>
    )
  }

  const dateLong = formatDataLonga(wedding.wedding_date)
  const days = daysUntil(wedding.wedding_date)
  const pd = wedding.produto_data
  const tipoLabel = pdStr(pd, 'ww_tipo_casamento') || 'Destination Wedding'
  const gate = wedding.gate
  const gatePct = gate.total > 0 ? Math.round((gate.met / gate.total) * 100) : 0
  const etapaIdx = PLANEJAMENTO_ORDER.indexOf(wedding.planejamentoEtapa) + 1

  // 4 números de convidados (blueprint): contrato · lista · bloqueio · confirmados
  const contrato = pdNum(pd, PLANEJ_FIELD.convidadosContrato)
  const listaTotal = wedding.counts.total
  const confirmados = wedding.counts.confirmado
  const bloqueio = wedding.hotelQuartos

  // Tarefas (medição do planejamento) + prazo configurável.
  // O relógio conta da ENTRADA no planejamento (carimbada ao entrar em pos_venda);
  // se não houver carimbo (casamentos antigos), cai pra data de criação do card.
  // Prazo = override deste casamento (se houver) OU o padrão do workspace.
  const { feitos, atrasados, pendentes } = wedding.checklist
  const planStart = pdStr(pd, PLANEJ_FIELD.posVendaEm).slice(0, 10) || (wedding.created_at ?? '').slice(0, 10)
  const overrideDias = pdNum(pd, PLANEJ_FIELD.prazoDiasOverride)
  const prazoDias = overrideDias != null && overrideDias > 0 ? Math.round(overrideDias) : defaultDias
  const planDeadline = planStart ? addDaysIso(planStart, prazoDias) : null
  const planDias = daysUntil(planDeadline)
  const slaText =
    planDeadline == null ? 'sem data de entrada'
    : planDias == null ? '—'
    : planDias > 0 ? `faltam ${planDias}d dos ${prazoDias}`
    : planDias === 0 ? 'prazo é hoje'
    : `${Math.abs(planDias)}d atrasado`

  const salvarPrazo = (dias: number | null) => {
    const v = dias != null && dias > 0 ? Math.min(365, Math.round(dias)) : null
    campos.save.mutate(
      { cardId: wedding.id, values: { [PLANEJ_FIELD.prazoDiasOverride]: v } },
      { onSuccess: () => setEditandoPrazo(false) },
    )
  }

  // Financeiro por setor
  const valorTotal = pdNum(pd, PLANEJ_FIELD.valorTotal)
  const pacoteValor = pdNum(pd, PLANEJ_FIELD.pacoteValor)
  const evento = valorTotal ?? pacoteValor
  const hosp = wedding.hotelTarifa != null && wedding.hotelQuartos != null ? wedding.hotelTarifa * wedding.hotelQuartos : null
  const sinal = pdNum(pd, PLANEJ_FIELD.sinalValor)

  // Status + resumo dos blocos colapsáveis — o "bater o olho" de cada gaveta.
  const areas = faixaDeSaude(wedding)
  const st = (k: string) => areas.find(a => a.key === k)?.status
  const resumoLocal = [pdStr(pd, PLANEJ_FIELD.regiao), pdStr(pd, PLANEJ_FIELD.formato), pdStr(pd, PLANEJ_FIELD.espaco)].filter(Boolean).join(' · ') || 'a preencher'
  const hotelStatusLabel = wedding.hotelStatus === 'confirmado' ? 'confirmado' : wedding.hotelStatus === 'bloqueado' ? 'bloqueado' : 'a definir'
  const fechados = pdNum(pd, PLANEJ_FIELD.bloqueioAptosFechados)
  const resumoHosp = [
    wedding.hotelQuartos != null ? `${wedding.hotelQuartos} aptos` : null,
    `bloqueio ${hotelStatusLabel}`,
    fechados != null ? `${fechados} já fecharam` : null,
  ].filter(Boolean).join(' · ')
  const comissaoSet = !!(pdStr(pd, PLANEJ_FIELD.comissaoHospPct) || pdStr(pd, PLANEJ_FIELD.comissaoPacotePct))
  const resumoComissao = comissaoSet ? 'registrado (hospedagem / pacote)' : 'a registrar — some no Monde se faltar'
  const tarifasSet = !!(pdStr(pd, PLANEJ_FIELD.tarifasObs) || pdStr(pd, PLANEJ_FIELD.politicaCancelamento) || pdStr(pd, PLANEJ_FIELD.politicaReducao))
  const resumoTarifas = tarifasSet ? 'tarifas e políticas registradas' : 'aguardando o contrato do hotel'
  const promoSet = !!pdStr(pd, PLANEJ_FIELD.promoTarifa)
  const resumoPromo = promoSet
    ? [pdStr(pd, PLANEJ_FIELD.promoTarifa) ? `R$ ${pdStr(pd, PLANEJ_FIELD.promoTarifa)}/noite` : null, pdStr(pd, PLANEJ_FIELD.promoFim) ? `até ${pdStr(pd, PLANEJ_FIELD.promoFim).slice(8, 10)}/${pdStr(pd, PLANEJ_FIELD.promoFim).slice(5, 7)}` : null].filter(Boolean).join(' · ')
    : 'a definir (tarifa + janela)'
  const resumoConvidados = `${listaTotal} na lista · ${confirmados} confirmados${contrato != null ? ` · contrato ${contrato}` : ''}`
  const notasTxt = pdStr(pd, PLANEJ_FIELD.notas)
  const resumoNotas = notasTxt ? notasTxt.split('\n')[0].slice(0, 80) : 'sem notas'
  const decididas = [pdStr(pd, PLANEJ_FIELD.regiao), pdStr(pd, PLANEJ_FIELD.dataHoraCasamento) || (wedding.wedding_date ?? ''), pdStr(pd, PLANEJ_FIELD.espaco), pdStr(pd, PLANEJ_FIELD.valorTotal) || pdStr(pd, PLANEJ_FIELD.pacoteValor)].filter(Boolean).length

  return (
    <div className={cn(CHAMP_PAGE, 'px-6 py-4 flex flex-col gap-4')}>
      {/* Summary band (visual champanhe — design do Vitor) */}
      <div className="rounded-2xl border border-[#E6DBC9] bg-white overflow-hidden shadow-[0_10px_30px_rgba(78,24,32,0.06)]">
        <div className="flex items-center justify-between gap-4 flex-wrap px-6 py-5 bg-gradient-to-b from-[#FBF3E4] to-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#A88C57]">
              <button onClick={() => navigate('/planejamento')} className="inline-flex items-center gap-1 hover:text-[#BD965C]">
                <ArrowLeft className="w-3.5 h-3.5" /> Planejamento
              </button>
              <span className="text-[#D9CFC2]">/</span>
              <span className="truncate">{tipoLabel}{wedding.local ? ` · ${wedding.local}` : ''}</span>
            </div>
            <h1 className="mt-2 text-[30px] leading-none font-light text-[#211F1D] break-words">{wedding.titulo}</h1>
            {wedding.site_url && (
              <a href={wedding.site_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[#a37f47] hover:underline mt-2 [font-family:'Roboto']">
                <Globe className="w-3.5 h-3.5" /> Site do casamento <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {days !== null && (
              <div className="flex items-center gap-3 rounded-xl border border-[#ECD9B5] bg-white px-4 py-2.5">
                <Calendar className="w-5 h-5 text-[#BD965C]" />
                <div>
                  <div className="flex items-baseline gap-1.5"><span className="text-[22px] font-extrabold text-[#8A6A33] leading-none">{Math.abs(days)}</span><span className="text-[13px] font-semibold text-[#A88C57]">{days < 0 ? 'dias atrás' : 'dias p/ o casamento'}</span></div>
                  <div className="text-[12px] text-[#9A9082] mt-0.5 [font-family:'Roboto']">{dateLong ?? '—'}</div>
                </div>
              </div>
            )}
            <button
              onClick={() => navigate(`/convidados/casamento/${wedding.id}`)}
              className="inline-flex items-center gap-2 h-[38px] px-4 rounded-lg border border-[#E0D6C8] bg-white text-[#5C5751] text-[13px] font-semibold hover:bg-[#FCFAF6]"
            >
              <Heart className="w-4 h-4 text-rose-400" /> Convidados
            </button>
            <a
              href={`/cards/${wedding.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-[38px] px-4 rounded-lg border border-[#BD965C] bg-[#BD965C] text-white text-[13px] font-semibold shadow-[0_1px_2px_rgba(140,100,40,0.25)]"
            >
              Acessar card <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* stat row — foto rápida alinhada ao blueprint */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 px-6 pb-5 items-stretch">
          {/* Etapa + marcos */}
          <HeaderCard tone="gold">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#A88C57]">Etapa · {etapaIdx} de 6</span>
              <span className="text-[11px] font-bold text-[#8A6A33]">{gate.met}/{gate.total} marcos</span>
            </div>
            <div className="text-[14px] font-semibold text-[#211F1D] mt-1.5 leading-tight flex-1">{PLANEJAMENTO_LABEL[wedding.planejamentoEtapa]}</div>
            <div className="h-1.5 rounded-full bg-[#EFE3CC] overflow-hidden mt-2.5"><div className="h-full bg-[#BD965C] rounded-full" style={{ width: `${gatePct}%` }} /></div>
          </HeaderCard>

          {/* 4 números de convidados */}
          <HeaderCard>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#A89A86]">Convidados</span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2 flex-1">
              <MiniNum label="Contrato" value={contrato != null ? String(contrato) : '—'} />
              <MiniNum label="Lista" value={String(listaTotal)} />
              <MiniNum label="Bloqueio" value={bloqueio != null ? String(bloqueio) : '—'} />
              <MiniNum label="Confirmados" value={String(confirmados)} />
            </div>
          </HeaderCard>

          {/* Tarefas (meta de prazo configurável) */}
          <HeaderCard>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#A89A86]">
                Tarefas · meta {prazoDias} dias{overrideDias != null && overrideDias > 0 ? ' (deste casamento)' : ''}
              </span>
              {!editandoPrazo && (
                <button
                  type="button"
                  onClick={() => setEditandoPrazo(true)}
                  className="p-0.5 rounded text-[#B5ABA0] hover:text-[#8A6A33] hover:bg-[#F4ECDD] shrink-0"
                  title="Definir o prazo deste casamento"
                  aria-label="Editar prazo deste casamento"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 flex-1">
              <MiniNum label="Feitas" value={String(feitos)} />
              <MiniNum label="Atrasadas" value={String(atrasados)} tone={atrasados > 0 ? 'rose' : undefined} />
              <MiniNum label="Pendentes" value={String(pendentes)} />
            </div>
            {editandoPrazo ? (
              <PrazoEditor
                inicial={overrideDias != null && overrideDias > 0 ? Math.round(overrideDias) : prazoDias}
                padrao={defaultDias}
                temOverride={overrideDias != null && overrideDias > 0}
                saving={campos.save.isPending}
                onSalvar={salvarPrazo}
                onCancelar={() => setEditandoPrazo(false)}
              />
            ) : (
              <div className="text-[11px] text-[#9A9082] mt-2 [font-family:'Roboto']">{slaText}</div>
            )}
          </HeaderCard>

          {/* Financeiro por setor */}
          <HeaderCard>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#A89A86]">Financeiro</span>
            <div className="text-[19px] font-bold text-[#211F1D] mt-1.5 [font-family:'Roboto'] tabular-nums flex-1">{evento != null ? brlK(evento) : '—'}<span className="text-[11px] font-medium text-[#B5ABA0] ml-1">casamento</span></div>
            <div className="text-[11px] text-[#9A9082] mt-1 [font-family:'Roboto'] leading-relaxed">
              Hospedagem {hosp != null ? `~${brlK(hosp)}/noite` : '—'}<br />
              Sinal {sinal != null ? brlK(sinal) : '—'}
            </div>
          </HeaderCard>
        </div>

        {/* Faixa de saúde — o "bater o olho": verde = ok, amarelo = em andamento,
            cinza = a fazer, vermelho = atenção. Pedido direto da planejadora (25/06). */}
        <div className="flex items-center gap-1.5 flex-wrap px-6 py-3 border-t border-[#F0E9DD] bg-[#FCFAF6]">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A88C57] mr-1">Saúde</span>
          {faixaDeSaude(wedding).map(a => {
            const m = STATUS_META[a.status]
            return (
              <span key={a.key} className={cn('inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full text-[11.5px] font-semibold', m.chipBg, m.chipText)} title={`${a.label}: ${m.label}`}>
                <span className={cn('w-2 h-2 rounded-full', m.dot)} /> {a.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* Avançar de etapa — barra enxuta (substitui a antiga grade "Marcos"). */}
      <AvancarEtapaBar wedding={wedding} />

      {/* Trava da etapa (Fase 4) — a tarefa 🔒 que segura o avanço sobe pro topo */}
      <TravaBanner
        pendentes={wedding.travaPendentes}
        cobrancasVencidas={wedding.cobrancasVencidas}
        etapaLabel={PLANEJAMENTO_LABEL[wedding.planejamentoEtapa]}
        paradoDesde={wedding.paradoDesde}
      />

      {/* Casal (clientes) + Equipe do casamento (interno) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <div id={BLOCO.casal} className="scroll-mt-6"><CasalSection cardId={wedding.id} /></div>
        <div id={BLOCO.equipe} className="scroll-mt-6"><WeddingEquipeSection cardId={wedding.id} /></div>
      </div>

      {/* Local & Cerimônia — onde acontece + reserva/contrato (gaveta) */}
      <BlocoColapsavel
        id={BLOCO.local}
        icon={MapPin}
        titulo="Local & Cerimônia"
        status={st('local')}
        resumo={resumoLocal}
        storageKey={`${wedding.id}:local`}
        defaultOpen
      >
        <LocalCerimoniaBody wedding={wedding} />
      </BlocoColapsavel>

      {/* Hospedagem & Bloqueio — hotel + detalhe do bloqueio (pedido × fechado) */}
      <BlocoColapsavel
        icon={BedDouble}
        titulo="Hospedagem & Bloqueio"
        status={st('hospedagem')}
        resumo={resumoHosp}
        storageKey={`${wedding.id}:hospedagem`}
        defaultOpen
      >
        <HospedagemBloqueioBody wedding={wedding} />
      </BlocoColapsavel>

      {/* Comissionamento — a "abinha" pedida na reunião (hospedagem + pacote) */}
      <BlocoColapsavel
        icon={Coins}
        titulo="Comissionamento"
        status={st('comissao')}
        resumo={resumoComissao}
        storageKey={`${wedding.id}:comissao`}
        defaultOpen={false}
      >
        <ComissionamentoSection wedding={wedding} />
      </BlocoColapsavel>

      {/* Tarifas & Políticas — denso (do contrato): texto + anexo */}
      <BlocoColapsavel
        icon={Receipt}
        titulo="Tarifas & Políticas (cancelamento / redução)"
        status={tarifasSet ? 'ok' : 'todo'}
        resumo={resumoTarifas}
        storageKey={`${wedding.id}:tarifas`}
        defaultOpen={false}
      >
        <TarifasPoliticasSection wedding={wedding} onOpenDocs={() => setDocsOpen(true)} />
      </BlocoColapsavel>

      {/* Ação promocional (definição) */}
      <BlocoColapsavel
        id={BLOCO.promo}
        icon={Megaphone}
        titulo="Ação promocional"
        status={promoSet ? 'ok' : 'todo'}
        resumo={resumoPromo}
        storageKey={`${wedding.id}:promo`}
        defaultOpen={false}
      >
        <AcaoPromoSection wedding={wedding} />
      </BlocoColapsavel>

      {/* Convidados (lista & estimativa) */}
      <BlocoColapsavel
        id={BLOCO.convidados}
        icon={Users}
        titulo="Convidados (lista & estimativa)"
        status={st('convidados')}
        resumo={resumoConvidados}
        storageKey={`${wedding.id}:convidados`}
        defaultOpen={false}
      >
        <ConvidadosResumoSection wedding={wedding} />
      </BlocoColapsavel>

      {/* Cronograma & Tarefas — a espinha (Etapa → Marco → Tarefa) */}
      <div id={BLOCO.spine} className="scroll-mt-6">
        <CronogramaSpine checklist={checklist} currentEtapa={wedding.planejamentoEtapa} onOpenDoc={() => setDocsOpen(true)} />
      </div>

      {/* Documentos do casamento — anexos nativos do card (📎 abre-doc, Fase 4) */}
      {docsOpen && <DocsDrawer cardId={wedding.id} onClose={() => setDocsOpen(false)} />}

      {/* Decisões do casamento (destino/data/local/orçamento) + aceite do casal */}
      <BlocoColapsavel
        icon={Scale}
        titulo="Decisões do casamento"
        status={decididas === 4 ? 'ok' : decididas > 0 ? 'doing' : 'todo'}
        resumo={`${decididas} de 4 decididas (destino · data · local · orçamento)`}
        storageKey={`${wedding.id}:decisoes`}
        defaultOpen={false}
      >
        <DecisoesSection wedding={wedding} />
      </BlocoColapsavel>

      {/* E-mail com o casal (registro no card) */}
      <BlocoColapsavel
        icon={Mail}
        titulo="E-mail com o casal"
        resumo="a conversa formal por e-mail, dentro do casamento"
        storageKey={`${wedding.id}:email`}
        defaultOpen={false}
      >
        <EmailCasalSection wedding={wedding} />
      </BlocoColapsavel>

      {/* Notas da planejadora (texto livre) */}
      <BlocoColapsavel
        icon={StickyNote}
        titulo="Notas da planejadora"
        resumo={resumoNotas}
        storageKey={`${wedding.id}:notas`}
        defaultOpen={false}
      >
        <NotasSection wedding={wedding} />
      </BlocoColapsavel>

      {/* Relatório do casamento — saúde, financeiro, convidados, prazos */}
      <BlocoColapsavel
        icon={BarChart3}
        titulo="Relatório do casamento"
        resumo="saúde, financeiro, convidados e prazos num resumo"
        storageKey={`${wedding.id}:relatorio`}
        defaultOpen={false}
      >
        <RelatorioCasamento wedding={wedding} />
      </BlocoColapsavel>

      {/* Linha do tempo do casamento — histórico real (entrou, mudou de etapa,
          "campo X: A → B", cobrança) reusando o ActivityFeed nativo do card. */}
      <BlocoColapsavel
        icon={History}
        titulo="Linha do tempo do casamento"
        resumo="tudo que já aconteceu — entradas, mudanças de etapa e de decisões"
        storageKey={`${wedding.id}:timeline`}
        defaultOpen={false}
      >
        <div className="pt-3"><ActivityFeed cardId={wedding.id} /></div>
      </BlocoColapsavel>
    </div>
  )
}

// Trava visível no topo (D-P3): a(s) tarefa(s) 🔒 que seguram a etapa atual, com
// o dossiê "parado desde X · cobramos Y · resposta até Z". Some quando nada trava.
function diaMes(iso: string): string {
  const d = iso.slice(0, 10)
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`
}
function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

// Cor do trilho de severidade + da pílula "parada há N dias", escalando com o
// tempo: calmo (<7d), atenção (7–21d), cutucada (>21d, tom rosewood da marca).
function paradoTier(dias: number): { rail: string; pill: string } {
  if (dias > 21) return { rail: 'from-[#C99A53] via-[#B97F46] to-[#9B4E46]', pill: 'bg-[#F6E5DF] ring-[#E7CABF] text-[#9B4E46]' }
  if (dias >= 7) return { rail: 'from-[#D9BE8C] to-[#C99A53]', pill: 'bg-[#F8EBD2] ring-[#EAD3A8] text-[#8A6A1A]' }
  return { rail: 'from-[#E3D2AE] to-[#D9BE8C]', pill: 'bg-[#F1ECE3] ring-[#E3D8C6] text-[#8A8278]' }
}

type TravaItem = { titulo: string; tipo: string | null; prazo: string | null; ultimaCobranca: string | null; esperandoTerceiro: boolean }

// Cada tarefa-trava vira um cartão acionável: ícone do tipo + título + chips de
// estado (só os que têm sinal real — sem "sem prazo/ainda não cobramos" mortos).
function TravaTaskCard({ t, hoje, onJump }: { t: TravaItem; hoje: string; onJump: () => void }) {
  const Icon = getTaskTypeConfig(t.tipo ?? 'tarefa').icon
  const vencido = !!t.prazo && t.prazo < hoje
  return (
    <button
      type="button"
      onClick={onJump}
      className={cn(
        'group text-left w-full rounded-2xl border p-3.5 flex items-start gap-3 transition-colors',
        vencido ? 'border-[#F0DCD7] bg-[#FDF6F4] hover:bg-white' : 'border-[#EDE4D6] bg-[#FCFAF6] hover:border-[#E1D2BC] hover:bg-white',
      )}
    >
      <span className={cn('w-9 h-9 rounded-xl bg-white ring-1 grid place-items-center shrink-0', vencido ? 'ring-[#EFCFC6]' : 'ring-[#EAD9BE]')}>
        <Icon className={cn('w-[18px] h-[18px]', vencido ? 'text-[#B0473C]' : 'text-[#B97F46]')} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-[#2B2824] leading-snug">{t.titulo}</p>
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {t.esperandoTerceiro && (
            <span className="inline-flex items-center gap-1.5 h-6 pl-1.5 pr-2.5 rounded-full bg-[#FBEFD9] text-[#8A6A1A] text-[11px] font-medium">
              <Hourglass className="w-3 h-3" /> esperando o casal/fornecedor
            </span>
          )}
          {t.prazo && (
            vencido ? (
              <span className="inline-flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-full bg-[#F8E0DB] text-[#B0473C] text-[11px] font-semibold">
                <AlarmClock className="w-3 h-3" /> venceu {diaMes(t.prazo)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-full bg-[#EEF3EA] text-[#4F7A4A] text-[11px] font-medium">
                <CalendarCheck className="w-3 h-3" /> responde até {diaMes(t.prazo)}
              </span>
            )
          )}
          {t.ultimaCobranca && (
            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[#F7EFD9] text-[#9A7B2E] text-[11px] font-medium">
              <Bell className="w-3 h-3" /> cobramos {diaMes(t.ultimaCobranca)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-[#C9BCA8] mt-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  )
}

function TravaBanner({
  pendentes,
  cobrancasVencidas,
  etapaLabel,
  paradoDesde,
}: {
  pendentes: TravaItem[]
  cobrancasVencidas: number
  etapaLabel: string
  paradoDesde: string | null
}) {
  if (pendentes.length === 0 && cobrancasVencidas === 0) return null

  const hoje = new Date().toISOString().slice(0, 10)
  const dias = paradoDesde ? diasDesde(paradoDesde) : 0
  const tier = paradoTier(dias)
  const irParaTarefas = () => {
    const el = document.getElementById(BLOCO.spine)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('bloco-flash')
    window.setTimeout(() => el.classList.remove('bloco-flash'), 1400)
  }

  return (
    <section className="relative overflow-hidden rounded-[20px] bg-white border border-[#ECE3D5] shadow-[0_10px_34px_rgba(78,24,32,0.07)]">
      <div className={cn('absolute left-0 top-0 bottom-0 w-[5px] bg-gradient-to-b', tier.rail)} />
      <div className="p-5 sm:p-6 pl-7">
        {pendentes.length > 0 && (
          <>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3.5 min-w-0">
                <span className="w-11 h-11 rounded-2xl bg-[#FBEFD9] ring-1 ring-[#EAD3A8] grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <Lock className="w-5 h-5 text-[#A2741F]" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[16px] font-extrabold tracking-tight text-[#211F1D] leading-tight">Esta etapa está travada</h3>
                  <p className="text-[12.5px] text-[#8A8278] mt-1 [font-family:'Roboto']">
                    {etapaLabel} · <span className="text-[#6F675E] font-semibold">{pendentes.length === 1 ? '1 marco segura' : `${pendentes.length} marcos seguram`} o avanço</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {paradoDesde && (
                  <span className={cn('inline-flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full ring-1', tier.pill)} title={`Parada nesta etapa desde ${diaMes(paradoDesde)}`}>
                    <Clock className="w-[14px] h-[14px]" />
                    <span className="text-[12.5px] font-bold tabular-nums">parada há {dias} dia{dias === 1 ? '' : 's'}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={irParaTarefas}
                  className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#BD965C] text-white text-[12.5px] font-semibold shadow-[0_1px_2px_rgba(140,100,40,0.25)] hover:bg-[#a37f47] transition-colors"
                >
                  Ver tarefas <ArrowRight className="w-[14px] h-[14px]" />
                </button>
              </div>
            </div>
            <div className={cn('mt-4 grid gap-3', pendentes.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
              {pendentes.map((t, i) => (
                <TravaTaskCard key={i} t={t} hoje={hoje} onJump={irParaTarefas} />
              ))}
            </div>
          </>
        )}

        {cobrancasVencidas > 0 && (
          <div className={cn('flex items-center gap-2 text-[12px] text-[#9A7B2E]', pendentes.length > 0 && 'mt-4 pt-3 border-t border-[#F0E6CE]')}>
            <Bell className="w-3.5 h-3.5 text-[#BD965C]" />
            {cobrancasVencidas} {cobrancasVencidas === 1 ? 'tarefa vencida vira cobrança automática' : 'tarefas vencidas viram cobrança automática'} — a recobrança aparece em “Minhas tarefas”.
          </div>
        )}
      </div>
    </section>
  )
}

// Gaveta lateral com os anexos NATIVOS do card (tabela arquivos + bucket
// card-documents). O 📎 das tarefas "Ler/Receber o contrato" abre aqui — sem
// tirar a planejadora da tela do casamento. Vazio até subirem o 1º documento.
function DocsDrawer({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true">
      <div className="w-full max-w-md h-full bg-[#F7F2EA] border-l border-[#E6DBC9] shadow-xl flex flex-col overflow-y-auto">
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#E6DBC9] bg-white sticky top-0">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-[#BD965C]" />
            <h2 className="text-[15px] font-semibold text-[#211F1D]">Documentos do casamento</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-4">
          <p className="text-[12px] text-[#9A9082] mb-3 [font-family:'Roboto',sans-serif]">
            Contratos e arquivos deste casamento. Arraste pra cá ou clique pra subir; depois é só clicar pra abrir.
          </p>
          <AttachmentsWidget cardId={cardId} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

function HeaderCard({ children, tone }: { children: ReactNode; tone?: 'gold' }) {
  return (
    <div className={cn(
      'rounded-xl border p-3.5 flex flex-col',
      tone === 'gold' ? 'border-[#ECDCBE] bg-[#FCF7EE]' : 'border-[#EAE1D3] bg-[#FBF8F3]',
    )}>
      {children}
    </div>
  )
}

function MiniNum({ label, value, tone }: { label: string; value: string; tone?: 'rose' }) {
  return (
    <div className="min-w-0">
      <div className={cn('text-[18px] font-bold [font-family:\'Roboto\'] tabular-nums leading-none', tone === 'rose' ? 'text-rose-600' : 'text-[#211F1D]')}>{value}</div>
      <div className="text-[10px] text-[#B5ABA0] mt-0.5 uppercase tracking-[0.05em] truncate">{label}</div>
    </div>
  )
}

// Editor inline do prazo DESTE casamento (override). Vazio/0 → volta pro padrão do workspace.
function PrazoEditor({
  inicial,
  padrao,
  temOverride,
  saving,
  onSalvar,
  onCancelar,
}: {
  inicial: number
  padrao: number
  temOverride: boolean
  saving: boolean
  onSalvar: (dias: number | null) => void
  onCancelar: () => void
}) {
  const [val, setVal] = useState(String(inicial))
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          max={365}
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-16 px-2 py-1 text-[12px] rounded-md border border-[#E0D6C8] bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#BD965C]/30"
        />
        <span className="text-[11px] text-[#9A9082]">dias</span>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSalvar(Number(val) || null)}
          className="p-1 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
          title="Salvar"
          aria-label="Salvar prazo"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="p-1 rounded text-slate-400 hover:bg-slate-100"
          title="Cancelar"
          aria-label="Cancelar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onSalvar(null)}
        className={cn('self-start text-[10px] underline', temOverride ? 'text-[#A88C57] hover:text-[#8A6A33]' : 'text-transparent pointer-events-none')}
      >
        usar o padrão ({padrao} dias)
      </button>
    </div>
  )
}


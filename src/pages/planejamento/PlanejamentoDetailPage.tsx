import { useState } from 'react'
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
  Pencil,
  Check,
  Circle,
  X,
  AlarmClock,
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
  PackageCheck,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { getTaskTypeConfig } from '../../components/tasks/taskTypeConfig'
import './champagne.css'
import { daysUntil, addDaysIso } from '../../lib/planejamento/format'
import { usePlanejamentoWeddings, type WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { useWeddingChecklist } from '../../hooks/planejamento/useWeddingChecklist'
import { useWeddingPlanningPrazo } from '../../hooks/planejamento/useWeddingPlanningPrazo'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'
import { JornadaCasamento } from '../../components/planejamento/JornadaCasamento'
import { RelatorioCasamento } from '../../components/planejamento/RelatorioCasamento'
import { faixaDeSaude } from '../../lib/planejamento/statusBloco'
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
import { PLANEJ_FIELD, BLOCO, type ChecklistItem } from '../../hooks/planejamento/types'

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
function pdBool(pd: Record<string, unknown> | null, key: string): boolean {
  const v = pd?.[key]
  return v === true || v === 'true'
}

function diaMes(iso: string): string {
  const d = iso.slice(0, 10)
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`
}
function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}
function dataExtenso(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
}

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
        <button onClick={() => navigate('/planejamento')} className="text-sm text-[#a37f47] hover:underline mb-4">
          ← Voltar
        </button>
        <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">
          Não consegui carregar este casamento no planejamento.
        </div>
      </div>
    )
  }

  const days = daysUntil(wedding.wedding_date)
  const pd = wedding.produto_data
  const tipoLabel = pdStr(pd, 'ww_tipo_casamento') || 'Destination Wedding'
  const dataFmt = dataExtenso(wedding.wedding_date)

  // Convidados — usados no resumo do bloco Convidados.
  const contrato = pdNum(pd, PLANEJ_FIELD.convidadosContrato)
  const listaTotal = wedding.counts.total
  const confirmados = wedding.counts.confirmado

  // Prazo do PLANEJAMENTO (relógio interno) — conta da ENTRADA no planejamento.
  // (≠ data do casamento, que vai no cabeçalho.) Override por casamento ou padrão do workspace.
  const planStart = pdStr(pd, PLANEJ_FIELD.posVendaEm).slice(0, 10) || (wedding.created_at ?? '').slice(0, 10)
  const overrideDias = pdNum(pd, PLANEJ_FIELD.prazoDiasOverride)
  const prazoDias = overrideDias != null && overrideDias > 0 ? Math.round(overrideDias) : defaultDias
  const planDeadline = planStart ? addDaysIso(planStart, prazoDias) : null
  const planDias = daysUntil(planDeadline)
  const slaText =
    planDeadline == null ? 'sem prazo de entrada'
    : planDias == null ? '—'
    : planDias > 0 ? `faltam ${planDias}d dos ${prazoDias}`
    : planDias === 0 ? 'fecha hoje'
    : `${Math.abs(planDias)}d atrasado`
  const paradoDias = wedding.paradoDesde ? diasDesde(wedding.paradoDesde) : null

  const salvarPrazo = (dias: number | null) => {
    const v = dias != null && dias > 0 ? Math.min(365, Math.round(dias)) : null
    campos.save.mutate(
      { cardId: wedding.id, values: { [PLANEJ_FIELD.prazoDiasOverride]: v } },
      { onSuccess: () => setEditandoPrazo(false) },
    )
  }

  // Status + resumo dos blocos colapsáveis (a bolinha de cada gaveta).
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
    ? [pdStr(pd, PLANEJ_FIELD.promoTarifa) ? `R$ ${pdStr(pd, PLANEJ_FIELD.promoTarifa)}/noite` : null, pdStr(pd, PLANEJ_FIELD.promoFim) ? `até ${diaMes(pdStr(pd, PLANEJ_FIELD.promoFim))}` : null].filter(Boolean).join(' · ')
    : 'a definir (tarifa + janela)'
  const resumoConvidados = `${listaTotal} na lista · ${confirmados} confirmados${contrato != null ? ` · contrato ${contrato}` : ''}`
  const notasTxt = pdStr(pd, PLANEJ_FIELD.notas)
  const resumoNotas = notasTxt ? notasTxt.split('\n')[0].slice(0, 80) : 'sem notas'
  const decididas = [pdStr(pd, PLANEJ_FIELD.regiao), pdStr(pd, PLANEJ_FIELD.dataHoraCasamento) || (wedding.wedding_date ?? ''), pdStr(pd, PLANEJ_FIELD.espaco), pdStr(pd, PLANEJ_FIELD.valorTotal) || pdStr(pd, PLANEJ_FIELD.pacoteValor)].filter(Boolean).length

  const goToSpine = () => {
    const el = document.getElementById(BLOCO.spine)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('bloco-flash')
    window.setTimeout(() => el.classList.remove('bloco-flash'), 1400)
  }

  return (
    <div className={cn(CHAMP_PAGE, 'px-6 py-4 flex flex-col gap-4')}>
      {/* Topo: identidade + data do casamento ao lado do nome + trilha das 6 etapas.
          Sem faixa de "saúde" (poluía) e sem a linha de "ritmo" repetida. */}
      <div className="rounded-2xl border border-[#E6DBC9] bg-white overflow-hidden shadow-[0_10px_30px_rgba(78,24,32,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap px-6 py-5 bg-gradient-to-b from-[#FBF3E4] to-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#A88C57]">
              <button onClick={() => navigate('/planejamento')} className="inline-flex items-center gap-1 hover:text-[#BD965C]">
                <ArrowLeft className="w-3.5 h-3.5" /> Planejamento
              </button>
              <span className="text-[#D9CFC2]">/</span>
              <span className="truncate">{tipoLabel}{wedding.local ? ` · ${wedding.local}` : ''}</span>
            </div>
            <div className="mt-2 flex items-center gap-3.5 flex-wrap">
              <h1 className="text-[30px] leading-none font-light text-[#211F1D] break-words">{wedding.titulo}</h1>
              {(dataFmt || days != null) && (
                <span className="inline-flex items-center gap-2 h-8 px-3.5 rounded-full bg-[#FBF6E8] border border-[#ECD9B5] text-[13px] text-[#8A6A33] [font-family:'Roboto']">
                  <Calendar className="w-3.5 h-3.5 text-[#BD965C]" />
                  {dataFmt && <span>{dataFmt}</span>}
                  {days != null && (
                    <b className="text-[#211F1D]">· {days < 0 ? `foi há ${Math.abs(days)} dias` : days === 0 ? 'é hoje' : `faltam ${days} dias`}</b>
                  )}
                </span>
              )}
            </div>
            {wedding.site_url && (
              <a href={wedding.site_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[#a37f47] hover:underline mt-2 [font-family:'Roboto']">
                <Globe className="w-3.5 h-3.5" /> Site do casamento <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
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

        {/* Jornada — trilha das 6 etapas + botão Avançar (barrado pela trava real). */}
        <div className="px-6 pb-5 pt-1 border-t border-[#F0E9DD]">
          <JornadaCasamento wedding={wedding} />
        </div>
      </div>

      {/* O TRABALHO — última concluída × próxima pendente, com atalho pra tarefa. */}
      <TrabalhoLane
        items={checklist.items}
        currentEtapa={wedding.planejamentoEtapa}
        paradoDias={paradoDias}
        feitas={wedding.checklist.feitos}
        total={wedding.checklist.total}
        slaText={slaText}
        prazoDias={prazoDias}
        defaultDias={defaultDias}
        overrideDias={overrideDias}
        editandoPrazo={editandoPrazo}
        savingPrazo={campos.save.isPending}
        onEditPrazo={() => setEditandoPrazo(true)}
        onSalvarPrazo={salvarPrazo}
        onCancelarPrazo={() => setEditandoPrazo(false)}
        onGoToSpine={goToSpine}
      />

      {/* Cronograma & Tarefas — a espinha sobe pro topo (trabalho do dia). */}
      <div id={BLOCO.spine} className="scroll-mt-6">
        <CronogramaSpine checklist={checklist} currentEtapa={wedding.planejamentoEtapa} onOpenDoc={() => setDocsOpen(true)} />
      </div>

      {/* Pronto para a próxima fase — o que está definido × em aberto (handoff). */}
      <HandoffCard wedding={wedding} />

      {/* Documentos do casamento — anexos nativos do card (📎 das tarefas). */}
      {docsOpen && <DocsDrawer cardId={wedding.id} onClose={() => setDocsOpen(false)} />}

      {/* Casal (clientes) + Equipe do casamento (interno) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <div id={BLOCO.casal} className="scroll-mt-6"><CasalSection cardId={wedding.id} /></div>
        <div id={BLOCO.equipe} className="scroll-mt-6"><WeddingEquipeSection cardId={wedding.id} /></div>
      </div>

      {/* As definições (papelada) — recolhidas embaixo, com bolinha de status. */}
      <BlocoColapsavel id={BLOCO.local} icon={MapPin} titulo="Local & Cerimônia" status={st('local')} resumo={resumoLocal} storageKey={`${wedding.id}:local`} defaultOpen={false}>
        <LocalCerimoniaBody wedding={wedding} />
      </BlocoColapsavel>

      <BlocoColapsavel icon={BedDouble} titulo="Hospedagem & Bloqueio" status={st('hospedagem')} resumo={resumoHosp} storageKey={`${wedding.id}:hospedagem`} defaultOpen={false}>
        <HospedagemBloqueioBody wedding={wedding} />
      </BlocoColapsavel>

      <BlocoColapsavel icon={Coins} titulo="Comissionamento" status={st('comissao')} resumo={resumoComissao} storageKey={`${wedding.id}:comissao`} defaultOpen={false}>
        <ComissionamentoSection wedding={wedding} />
      </BlocoColapsavel>

      <BlocoColapsavel icon={Receipt} titulo="Tarifas & Políticas (cancelamento / redução)" status={tarifasSet ? 'ok' : 'todo'} resumo={resumoTarifas} storageKey={`${wedding.id}:tarifas`} defaultOpen={false}>
        <TarifasPoliticasSection wedding={wedding} onOpenDocs={() => setDocsOpen(true)} />
      </BlocoColapsavel>

      <BlocoColapsavel id={BLOCO.promo} icon={Megaphone} titulo="Ação promocional" status={promoSet ? 'ok' : 'todo'} resumo={resumoPromo} storageKey={`${wedding.id}:promo`} defaultOpen={false}>
        <AcaoPromoSection wedding={wedding} />
      </BlocoColapsavel>

      <BlocoColapsavel id={BLOCO.convidados} icon={Users} titulo="Convidados (lista & estimativa)" status={st('convidados')} resumo={resumoConvidados} storageKey={`${wedding.id}:convidados`} defaultOpen={false}>
        <ConvidadosResumoSection wedding={wedding} />
      </BlocoColapsavel>

      <BlocoColapsavel icon={Scale} titulo="Decisões do casamento" status={decididas === 4 ? 'ok' : decididas > 0 ? 'doing' : 'todo'} resumo={`${decididas} de 4 decididas (destino · data · local · orçamento)`} storageKey={`${wedding.id}:decisoes`} defaultOpen={false}>
        <DecisoesSection wedding={wedding} />
      </BlocoColapsavel>

      <BlocoColapsavel icon={Mail} titulo="E-mail com o casal" resumo="a conversa formal por e-mail, dentro do casamento" storageKey={`${wedding.id}:email`} defaultOpen={false}>
        <EmailCasalSection wedding={wedding} />
      </BlocoColapsavel>

      <BlocoColapsavel icon={StickyNote} titulo="Notas da planejadora" resumo={resumoNotas} storageKey={`${wedding.id}:notas`} defaultOpen={false}>
        <NotasSection wedding={wedding} />
      </BlocoColapsavel>

      <BlocoColapsavel icon={BarChart3} titulo="Relatório do casamento" resumo="saúde, financeiro, convidados e prazos num resumo" storageKey={`${wedding.id}:relatorio`} defaultOpen={false}>
        <RelatorioCasamento wedding={wedding} />
      </BlocoColapsavel>

      <BlocoColapsavel icon={History} titulo="Linha do tempo do casamento" resumo="tudo que já aconteceu — entradas, mudanças de etapa e de decisões" storageKey={`${wedding.id}:timeline`} defaultOpen={false}>
        <div className="pt-3"><ActivityFeed cardId={wedding.id} /></div>
      </BlocoColapsavel>
    </div>
  )
}

// ── Faixa "O trabalho": última concluída × próxima pendente ──────────────────
// Não resolve aqui (pedido do Vitor) — só mostra o essencial e leva pra tarefa.
function TrabalhoLane({
  items,
  currentEtapa,
  paradoDias,
  feitas,
  total,
  slaText,
  prazoDias,
  defaultDias,
  overrideDias,
  editandoPrazo,
  savingPrazo,
  onEditPrazo,
  onSalvarPrazo,
  onCancelarPrazo,
  onGoToSpine,
}: {
  items: ChecklistItem[]
  currentEtapa: string
  paradoDias: number | null
  feitas: number
  total: number
  slaText: string
  prazoDias: number
  defaultDias: number
  overrideDias: number | null
  editandoPrazo: boolean
  savingPrazo: boolean
  onEditPrazo: () => void
  onSalvarPrazo: (dias: number | null) => void
  onCancelarPrazo: () => void
  onGoToSpine: () => void
}) {
  const hoje = new Date().toISOString().slice(0, 10)
  const feitos = items.filter(i => i.feito && i.updated_at)
  const ultima = feitos.length
    ? feitos.reduce((a, b) => ((a.updated_at ?? '') > (b.updated_at ?? '') ? a : b))
    : null
  const abertos = items.filter(i => !i.feito)
  // "Próxima" = o que vem AGORA: prioriza as tarefas da ETAPA ATUAL; só cai pra
  // outras etapas se a atual já estiver toda feita. Dentro do escopo, a de menor
  // prazo (vencida/mais próxima) vem primeiro; sem prazo, a primeira da ordem.
  const daEtapa = abertos.filter(i => (i.marco ?? '').startsWith(`${currentEtapa}:`))
  const escopo = daEtapa.length ? daEtapa : abertos
  const comPrazo = escopo.filter(i => i.prazo).sort((a, b) => (a.prazo! < b.prazo! ? -1 : 1))
  const proxima = comPrazo[0] ?? escopo[0] ?? null

  if (!ultima && !proxima && total === 0) return null

  const ProxIcon = proxima ? getTaskTypeConfig(proxima.tipo ?? 'tarefa').icon : Circle
  const proxVencida = !!(proxima?.prazo && proxima.prazo < hoje)

  return (
    <section className="rounded-2xl border border-[#E6DBC9] bg-white p-4 shadow-[0_1px_2px_rgba(78,24,32,0.05)] flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
        {/* Última concluída */}
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <span className="w-9 h-9 rounded-lg bg-emerald-600 text-white grid place-items-center shrink-0">
            <Check className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-emerald-700">Última concluída</p>
            {ultima ? (
              <>
                <p className="text-[13.5px] font-semibold text-[#211F1D] truncate">{ultima.titulo}</p>
                {ultima.updated_at && <p className="text-[11px] text-emerald-700/80 [font-family:'Roboto']">há {diasDesde(ultima.updated_at)} dias</p>}
              </>
            ) : (
              <p className="text-[12.5px] text-[#9A9082] mt-0.5">nada concluído ainda</p>
            )}
          </div>
        </div>

        <div className="hidden md:flex items-center justify-center text-[#CFC2AE]">
          <ArrowRight className="w-5 h-5" />
        </div>

        {/* Próxima pendente */}
        <button
          type="button"
          onClick={onGoToSpine}
          className={cn(
            'group flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
            proxVencida ? 'border-rose-200 bg-rose-50/60 hover:bg-rose-50' : 'border-[#EAD9BE] bg-[#FCFAF6] hover:bg-white',
          )}
        >
          <span className={cn('w-9 h-9 rounded-lg grid place-items-center shrink-0 border', proxVencida ? 'bg-rose-100 border-rose-200 text-rose-700' : 'bg-white border-[#EAD9BE] text-[#B97F46]')}>
            <ProxIcon className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#A88C57]">Próxima pendente</p>
            {proxima ? (
              <>
                <p className="text-[13.5px] font-semibold text-[#211F1D] truncate">{proxima.titulo}</p>
                {proxima.prazo ? (
                  <p className={cn('inline-flex items-center gap-1.5 text-[11px] mt-0.5 [font-family:\'Roboto\']', proxVencida ? 'text-rose-600 font-semibold' : 'text-[#9A9082]')}>
                    {proxVencida ? <AlarmClock className="w-3 h-3" /> : <CalendarCheck className="w-3 h-3" />}
                    {proxVencida ? `venceu ${diaMes(proxima.prazo)}` : `até ${diaMes(proxima.prazo)}`}
                  </p>
                ) : (
                  <p className="text-[11px] text-[#9A9082] mt-0.5 [font-family:'Roboto']">sem prazo definido</p>
                )}
              </>
            ) : (
              <p className="text-[12.5px] text-emerald-700 mt-0.5">tudo feito nesta etapa 🎉</p>
            )}
          </div>
          {proxima && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[12px] font-semibold text-[#8A6A33] whitespace-nowrap shrink-0">
              ir para a tarefa <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition" />
            </span>
          )}
        </button>
      </div>

      {/* Linha-resumo: parado, progresso e prazo do planejamento (editável). */}
      <div className="flex items-center gap-2 flex-wrap text-[11.5px] text-[#9A9082] [font-family:'Roboto']">
        {paradoDias != null && (
          <span className={cn(paradoDias > 21 ? 'text-rose-600 font-semibold' : paradoDias >= 7 ? 'text-[#8A6A1A] font-semibold' : '')}>
            Parado nesta etapa há <b>{paradoDias}d</b>
          </span>
        )}
        {paradoDias != null && <span className="text-[#D9CFC2]">·</span>}
        <span><b className="text-[#5C5751]">{feitas}</b> de {total} tarefas feitas</span>
        <span className="text-[#D9CFC2]">·</span>
        <span className="inline-flex items-center gap-1">
          prazo do planejamento: <b className={planDeadlineTone(slaText)}>{slaText}</b>
          {!editandoPrazo && (
            <button type="button" onClick={onEditPrazo} className="ml-0.5 p-0.5 rounded text-[#B5ABA0] hover:text-[#8A6A33] hover:bg-[#F4ECDD]" title="Definir o prazo deste casamento" aria-label="Editar prazo deste casamento">
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </span>
      </div>

      {editandoPrazo && (
        <PrazoEditor
          inicial={overrideDias != null && overrideDias > 0 ? Math.round(overrideDias) : prazoDias}
          padrao={defaultDias}
          temOverride={overrideDias != null && overrideDias > 0}
          saving={savingPrazo}
          onSalvar={onSalvarPrazo}
          onCancelar={onCancelarPrazo}
        />
      )}
    </section>
  )
}

function planDeadlineTone(slaText: string): string {
  if (slaText.includes('atrasado')) return 'text-rose-600'
  if (slaText.includes('hoje')) return 'text-[#8A6A1A]'
  return 'text-[#5C5751]'
}

// ── Cartão "Pronto para a próxima fase" (handoff) ────────────────────────────
// O que está DEFINIDO × EM ABERTO pra entregar pros próximos times. Lê campos
// que já existem (sem dado novo). A ação de entregar (mover pra Produção) entra
// numa próxima leva.
function HandoffCard({ wedding }: { wedding: WeddingPlanejamento }) {
  const pd = wedding.produto_data
  const contrato = pdNum(pd, PLANEJ_FIELD.convidadosContrato)
  const sinalValor = pdNum(pd, PLANEJ_FIELD.sinalValor)
  const itens: { ok: boolean; label: string; det?: string }[] = [
    { ok: !!pdStr(pd, PLANEJ_FIELD.espaco), label: 'Venue fechado', det: pdStr(pd, PLANEJ_FIELD.espaco) || undefined },
    { ok: pdBool(pd, PLANEJ_FIELD.contratoAssinado), label: 'Contrato do casamento assinado' },
    { ok: !!pdStr(pd, PLANEJ_FIELD.sinalPagoEm), label: 'Sinal pago', det: sinalValor != null ? `R$ ${sinalValor.toLocaleString('pt-BR')}` : undefined },
    { ok: wedding.hotelStatus === 'bloqueado' || wedding.hotelStatus === 'confirmado', label: 'Hotel bloqueado', det: wedding.hotelQuartos != null ? `${wedding.hotelQuartos} quartos` : undefined },
    { ok: !!pdStr(pd, PLANEJ_FIELD.promoTarifa), label: 'Ação promocional', det: pdStr(pd, PLANEJ_FIELD.promoTarifa) ? `R$ ${pdStr(pd, PLANEJ_FIELD.promoTarifa)}/noite` : undefined },
    { ok: pdBool(pd, PLANEJ_FIELD.listaPreenchida), label: 'Lista de convidados', det: `${wedding.counts.total}${contrato != null ? ` de ${contrato}` : ''}` },
  ]
  const done = itens.filter(i => i.ok).length

  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white p-5 shadow-[0_1px_2px_rgba(78,24,32,0.05)]">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="w-9 h-9 rounded-lg bg-emerald-600 text-white grid place-items-center shrink-0">
          <PackageCheck className="w-[18px] h-[18px]" />
        </span>
        <h2 className="text-[15px] font-bold text-[#211F1D]">Pronto para a próxima fase</h2>
        <span className="ml-auto text-[12px] font-bold text-emerald-700 [font-family:'Roboto']">{done} de {itens.length} definidos</span>
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {itens.map((it, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px]',
              it.ok ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800' : 'border-amber-200 bg-amber-50/70 text-amber-800',
            )}
          >
            {it.ok ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-amber-500 shrink-0" />}
            <span className="font-medium">{it.label}</span>
            {it.det && <span className="text-[#9A9082] truncate">— {it.det}</span>}
          </div>
        ))}
      </div>
    </section>
  )
}

// Gaveta lateral com os anexos NATIVOS do card (tabela arquivos + bucket
// card-documents). O 📎 das tarefas "Ler/Receber o contrato" abre aqui.
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
    <div className="flex flex-col gap-1.5">
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
        <button type="button" disabled={saving} onClick={() => onSalvar(Number(val) || null)} className="p-1 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-50" title="Salvar" aria-label="Salvar prazo">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onCancelar} className="p-1 rounded text-slate-400 hover:bg-slate-100" title="Cancelar" aria-label="Cancelar">
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

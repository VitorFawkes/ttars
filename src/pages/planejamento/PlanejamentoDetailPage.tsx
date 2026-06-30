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
  Hourglass,
  Pencil,
  Check,
  X,
  Lock,
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
  Pause,
  Target,
  ListChecks,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { getTaskTypeConfig } from '../../components/tasks/taskTypeConfig'
import './champagne.css'
import { daysUntil, addDaysIso } from '../../lib/planejamento/format'
import { usePlanejamentoWeddings } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { useWeddingChecklist } from '../../hooks/planejamento/useWeddingChecklist'
import { useWeddingPlanningPrazo } from '../../hooks/planejamento/useWeddingPlanningPrazo'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'
import { JornadaCasamento } from '../../components/planejamento/JornadaCasamento'
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

  const days = daysUntil(wedding.wedding_date)
  const pd = wedding.produto_data
  const tipoLabel = pdStr(pd, 'ww_tipo_casamento') || 'Destination Wedding'

  // Números de convidados — usados no resumo do bloco Convidados.
  const contrato = pdNum(pd, PLANEJ_FIELD.convidadosContrato)
  const listaTotal = wedding.counts.total
  const confirmados = wedding.counts.confirmado

  // Tarefas (medição do planejamento) + prazo configurável.
  // O relógio conta da ENTRADA no planejamento (carimbada ao entrar em pos_venda);
  // se não houver carimbo (casamentos antigos), cai pra data de criação do card.
  // Prazo = override deste casamento (se houver) OU o padrão do workspace.
  const { pendentes } = wedding.checklist
  // Ritmo do casamento (tempos que a planejadora pediu): parado, próxima, última, faltam.
  const proximaPrazo = wedding.checklist.proximaPrazo
  const ultimaConclusao = wedding.checklist.ultimaConclusao
  const proxDias = proximaPrazo ? daysUntil(proximaPrazo) : null
  const ultimaDias = ultimaConclusao ? diasDesde(ultimaConclusao) : null
  const paradoDias = wedding.paradoDesde ? diasDesde(wedding.paradoDesde) : null
  const planStart = pdStr(pd, PLANEJ_FIELD.posVendaEm).slice(0, 10) || (wedding.created_at ?? '').slice(0, 10)
  const overrideDias = pdNum(pd, PLANEJ_FIELD.prazoDiasOverride)
  const prazoDias = overrideDias != null && overrideDias > 0 ? Math.round(overrideDias) : defaultDias
  const planDeadline = planStart ? addDaysIso(planStart, prazoDias) : null
  const planDias = daysUntil(planDeadline)
  // Prazo do planejamento, curto (o chip já diz "faltam N tarefas" — não repetir "faltam").
  const slaText =
    planDeadline == null ? 'sem prazo de entrada'
    : planDias == null ? '—'
    : planDias > 0 ? `${planDias}d dos ${prazoDias}`
    : planDias === 0 ? 'fecha hoje'
    : `${Math.abs(planDias)}d atrasado`

  const salvarPrazo = (dias: number | null) => {
    const v = dias != null && dias > 0 ? Math.min(365, Math.round(dias)) : null
    campos.save.mutate(
      { cardId: wedding.id, values: { [PLANEJ_FIELD.prazoDiasOverride]: v } },
      { onSuccess: () => setEditandoPrazo(false) },
    )
  }

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

        {/* Jornada — onde está + por onde passou, de uma vez (trilha das 6 etapas + Avançar). */}
        <div className="px-6 pb-4 pt-0.5">
          <JornadaCasamento wedding={wedding} />
        </div>

        {/* Ritmo do casamento — os tempos que importam (pedido 25/06): parado · próxima
            entrega · última concluída · faltam tarefas/dias · casamento. Numa linha só. */}
        <div className="flex items-center gap-2 flex-wrap px-6 py-3 border-t border-[#F0E9DD] bg-[#FCFAF6]">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A88C57] mr-1">Ritmo</span>

          {paradoDias != null && (
            <span className={cn('inline-flex items-center gap-1.5 h-7 pl-2 pr-3 rounded-full text-[12px] border',
              paradoDias > 21 ? 'bg-[#F6E5DF] border-[#E7CABF] text-[#9B4E46]' : paradoDias >= 7 ? 'bg-[#F8EBD2] border-[#EAD3A8] text-[#8A6A1A]' : 'bg-white border-[#EAE1D3] text-[#6F675E]')}>
              <Pause className="w-3.5 h-3.5 shrink-0" /> parado há <b>{paradoDias}d</b> nesta etapa
            </span>
          )}

          {proximaPrazo ? (
            <span className={cn('inline-flex items-center gap-1.5 h-7 pl-2 pr-3 rounded-full text-[12px] border',
              proxDias != null && proxDias < 0 ? 'bg-[#F8E0DB] border-[#EFCFC6] text-[#B0473C] font-medium' : 'bg-white border-[#EAE1D3] text-[#6F675E]')}>
              <Target className={cn('w-3.5 h-3.5 shrink-0', proxDias != null && proxDias < 0 ? 'text-[#B0473C]' : 'text-[#BD965C]')} /> próxima entrega <b className={proxDias != null && proxDias < 0 ? '' : 'text-[#211F1D]'}>{diaMes(proximaPrazo)}</b>
              {proxDias != null && <span className={proxDias < 0 ? '' : 'text-[#9A9082]'}>· {proxDias < 0 ? `vencida há ${Math.abs(proxDias)}d` : proxDias === 0 ? 'hoje' : `em ${proxDias}d`}</span>}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 h-7 pl-2 pr-3 rounded-full text-[12px] bg-white border border-[#EAE1D3] text-[#9A9082]"><Target className="w-3.5 h-3.5 text-[#CBBEA8] shrink-0" /> sem prazo nas pendentes</span>
          )}

          {ultimaDias != null && (
            <span className="inline-flex items-center gap-1.5 h-7 pl-2 pr-3 rounded-full text-[12px] bg-white border border-[#EAE1D3] text-[#6F675E]">
              <Check className="w-3.5 h-3.5 text-[#4F7A4A] shrink-0" /> última feita {ultimaDias === 0 ? 'hoje' : `há ${ultimaDias}d`}
            </span>
          )}

          <span className="inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full text-[12px] bg-white border border-[#EAE1D3] text-[#6F675E]">
            <ListChecks className="w-3.5 h-3.5 text-[#BD965C] shrink-0" /> faltam <b className="text-[#211F1D]">{pendentes}</b> tarefa{pendentes === 1 ? '' : 's'}
            <span className="text-[#9A9082]">· {slaText}</span>
            {!editandoPrazo && (
              <button type="button" onClick={() => setEditandoPrazo(true)} className="ml-0.5 p-0.5 rounded text-[#B5ABA0] hover:text-[#8A6A33] hover:bg-[#F4ECDD]" title="Definir o prazo deste casamento" aria-label="Editar prazo deste casamento"><Pencil className="w-3 h-3" /></button>
            )}
          </span>

          {days !== null && (
            <span className="inline-flex items-center gap-1.5 h-7 pl-2 pr-3 rounded-full text-[12px] bg-white border border-[#EAE1D3] text-[#6F675E]">
              <Calendar className="w-3.5 h-3.5 text-[#BD965C] shrink-0" /> casamento {days < 0 ? `foi há ${Math.abs(days)}d` : `em ${days}d`}
            </span>
          )}

          {editandoPrazo && (
            <div className="w-full pt-1">
              <PrazoEditor
                inicial={overrideDias != null && overrideDias > 0 ? Math.round(overrideDias) : prazoDias}
                padrao={defaultDias}
                temOverride={overrideDias != null && overrideDias > 0}
                saving={campos.save.isPending}
                onSalvar={salvarPrazo}
                onCancelar={() => setEditandoPrazo(false)}
              />
            </div>
          )}
        </div>

        {/* Faixa de saúde — o "bater o olho": verde = ok, amarelo = em andamento,
            cinza = a fazer, vermelho = atenção. Pedido direto da planejadora (25/06). */}
        <div className="flex items-center gap-1.5 flex-wrap px-6 py-3 border-t border-[#F0E9DD] bg-[#FCFAF6]">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A88C57] mr-1">Saúde</span>
          {areas.map(a => {
            const m = STATUS_META[a.status]
            return (
              <span key={a.key} className={cn('inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full text-[11.5px] font-semibold', m.chipBg, m.chipText)} title={`${a.label}: ${m.label}`}>
                <span className={cn('w-2 h-2 rounded-full', m.dot)} /> {a.label}
              </span>
            )
          })}
        </div>
      </div>

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
              <button
                type="button"
                onClick={irParaTarefas}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#BD965C] text-white text-[12.5px] font-semibold shadow-[0_1px_2px_rgba(140,100,40,0.25)] hover:bg-[#a37f47] transition-colors shrink-0"
              >
                Ver tarefas <ArrowRight className="w-[14px] h-[14px]" />
              </button>
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


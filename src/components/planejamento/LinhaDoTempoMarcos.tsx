import { useQuery } from '@tanstack/react-query'
import {
  CalendarHeart,
  Sparkles,
  Handshake,
  FileSignature,
  Coins,
  Flag,
  ArrowDown,
  Milestone,
  PackageCheck,
  Lock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { sbAny } from '../../hooks/convidados/_supabaseUntyped'
import { PLANEJ_FIELD, MARCO_LABEL, type ChecklistItem } from '../../hooks/planejamento/types'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'

// Linha do tempo dos GRANDES MARCOS do casamento — quando cada coisa importante
// aconteceu e QUANTO TEMPO levou entre uma e outra. Junta 3 fontes nativas:
// 1) o card (criado, data do casamento), 2) produto_data (reuniões do Calendly,
// sinal, entrada no planejamento), 3) activities stage_changed (etapas reais) e
// 4) as tarefas-trava concluídas (marcos da espinha). Nada de tabela paralela.

interface Marco {
  key: string
  data: string // ISO
  titulo: string
  detalhe?: string
  icon: LucideIcon
  futuro?: boolean
}

interface StageChange {
  created_at: string
  metadata: { new_stage_name?: string; old_stage_name?: string } | null
}

function pdStr(pd: Record<string, unknown> | null, key: string): string {
  if (!pd) return ''
  const v = pd[key]
  return v == null ? '' : String(v)
}

function fmtData(iso: string): string {
  const d = iso.slice(0, 10)
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`
}

function diffDias(aIso: string, bIso: string): number {
  const a = new Date(aIso.slice(0, 10) + 'T00:00:00').getTime()
  const b = new Date(bIso.slice(0, 10) + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

export function LinhaDoTempoMarcos({
  wedding,
  checklistItems,
}: {
  wedding: WeddingPlanejamento
  checklistItems: ChecklistItem[]
}) {
  const pd = wedding.produto_data

  // Mudanças de etapa reais (mover_card loga stage_changed em activities).
  const { data: stageChanges } = useQuery<StageChange[]>({
    queryKey: ['planejamento', 'stage-changes', wedding.id],
    queryFn: async () => {
      const { data, error } = await sbAny
        .from('activities')
        .select('created_at, metadata')
        .eq('card_id', wedding.id)
        .eq('tipo', 'stage_changed')
        .order('created_at', { ascending: true })
        .limit(100)
      if (error) throw error
      return (data ?? []) as StageChange[]
    },
  })

  const hoje = new Date().toISOString()
  const marcos: Marco[] = []

  if (wedding.created_at) {
    marcos.push({ key: 'lead', data: wedding.created_at, titulo: 'Casal chegou (lead criado)', icon: Sparkles })
  }
  const sdrReuniao = pdStr(pd, 'ww_sdr_data_reuniao')
  if (sdrReuniao) marcos.push({ key: 'sdr', data: sdrReuniao, titulo: 'Primeira reunião (SDR)', icon: Handshake })
  const closerReuniao = pdStr(pd, 'ww_closer_data_reuniao')
  if (closerReuniao) marcos.push({ key: 'closer', data: closerReuniao, titulo: 'Reunião de fechamento (Closer)', icon: Handshake })
  const sinal = pdStr(pd, PLANEJ_FIELD.sinalPagoEm)
  if (sinal) marcos.push({ key: 'sinal', data: sinal, titulo: 'Sinal pago', icon: Coins })
  const posVenda = pdStr(pd, PLANEJ_FIELD.posVendaEm)
  if (posVenda) marcos.push({ key: 'planejamento', data: posVenda, titulo: 'Entrou no Planejamento', icon: Flag })

  // Etapas do funil (nome real da etapa, na data real da mudança).
  for (const [i, sc] of (stageChanges ?? []).entries()) {
    const nome = sc.metadata?.new_stage_name
    if (!nome) continue
    marcos.push({
      key: `stage-${i}`,
      data: sc.created_at,
      titulo: nome.toLowerCase().includes('produção') ? 'Entregue para a Produção' : `Etapa: ${nome}`,
      icon: nome.toLowerCase().includes('produção') ? PackageCheck : Milestone,
    })
  }

  // Tarefas-TRAVA concluídas = marcos cumpridos da espinha (contrato lido,
  // reunião feita, pagamento…). updated_at é o melhor carimbo disponível.
  for (const it of checklistItems) {
    if (!it.trava || !it.feito || !it.updated_at) continue
    const marcoLabel = it.marco ? MARCO_LABEL[it.marco] : null
    marcos.push({
      key: `trava-${it.id}`,
      data: it.status_reuniao === 'realizada' && it.data_hora ? it.data_hora : it.updated_at,
      titulo: it.titulo,
      detalhe: marcoLabel ? `marco: ${marcoLabel}` : undefined,
      icon: Lock,
    })
  }

  const contratoAssinado = pd?.[PLANEJ_FIELD.contratoAssinado]
  if ((contratoAssinado === true || contratoAssinado === 'true') && !marcos.some((m) => m.titulo.toLowerCase().includes('contrato'))) {
    // sem data própria — só aparece se nenhuma tarefa de contrato já cobre
    marcos.push({ key: 'contrato', data: posVenda || wedding.created_at || hoje, titulo: 'Contrato assinado', detalhe: 'data aproximada', icon: FileSignature })
  }

  if (wedding.wedding_date) {
    marcos.push({
      key: 'casamento',
      data: wedding.wedding_date,
      titulo: 'O casamento 💍',
      icon: CalendarHeart,
      futuro: wedding.wedding_date.slice(0, 10) > hoje.slice(0, 10),
    })
  }

  marcos.sort((a, b) => (a.data < b.data ? -1 : 1))

  if (marcos.length === 0) {
    return <p className="text-[12.5px] text-slate-400 italic pt-3">Ainda não há marcos registrados para este casamento.</p>
  }

  return (
    <div className="pt-3">
      <p className="text-[12px] text-[#9A9082] mb-4 [font-family:'Roboto',sans-serif]">
        Os grandes marcos do casamento — o que aconteceu, quando, e quanto tempo levou entre um e outro.
      </p>
      <ol className="relative flex flex-col">
        {marcos.map((m, i) => {
          const anterior = i > 0 ? marcos[i - 1] : null
          const delta = anterior ? diffDias(anterior.data, m.data) : null
          const Icon = m.icon
          return (
            <li key={m.key} className="relative">
              {/* tempo entre marcos */}
              {delta != null && delta > 0 && (
                <div className="flex items-center gap-2 pl-[52px] py-1 text-[11px] text-[#B5ABA0] [font-family:'Roboto']">
                  <ArrowDown className="w-3 h-3" />
                  <span className={cn('tabular-nums', delta > 60 && !m.futuro ? 'text-[#B97F46] font-semibold' : '')}>
                    {delta} dia{delta > 1 ? 's' : ''} depois
                  </span>
                </div>
              )}
              <div className="flex items-start gap-3">
                {/* trilho */}
                <div className="flex flex-col items-center self-stretch">
                  <span
                    className={cn(
                      'w-9 h-9 rounded-full grid place-items-center border shrink-0',
                      m.futuro
                        ? 'bg-white border-dashed border-[#D9CFC2] text-[#C9BDA8]'
                        : 'bg-[#FBF6E8] border-[#E6D3B3] text-[#8A6A33]',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  {i < marcos.length - 1 && <span className="w-px flex-1 bg-[#EAE1D3] mt-1" />}
                </div>
                {/* conteúdo */}
                <div className={cn('pb-3 min-w-0', m.futuro && 'opacity-70')}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('text-[13.5px] font-semibold', m.futuro ? 'text-[#9A9082]' : 'text-[#211F1D]')}>{m.titulo}</span>
                    <span className="text-[11px] text-[#A88C57] tabular-nums [font-family:'Roboto']">{fmtData(m.data)}</span>
                    {m.futuro && (
                      <span className="text-[10px] font-semibold text-[#A88C57] bg-[#FBF6E8] border border-[#ECD9B5] rounded-full px-1.5 py-0.5">
                        faltam {Math.abs(diffDias(hoje, m.data))} dias
                      </span>
                    )}
                  </div>
                  {m.detalhe && <p className="text-[11px] text-[#B5ABA0]">{m.detalhe}</p>}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

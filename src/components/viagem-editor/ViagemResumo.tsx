import { MapPin, Calendar, Users, DollarSign, Sparkles, CheckCircle2, Clock } from 'lucide-react'
import type { ViagemInternaRow, TripItemInterno } from '@/hooks/viagem/useViagemInterna'

interface Props {
  viagem: ViagemInternaRow
  items: TripItemInterno[]
  cardTitulo?: string | null
}

const ESTADO_DESCRICAO: Record<string, string> = {
  desenho: 'Montando a proposta.',
  em_recomendacao: 'Proposta enviada — cliente decidindo.',
  em_aprovacao: 'Cliente abriu a proposta.',
  confirmada: 'Aceita pelo cliente.',
  em_montagem: 'Pós-venda montando vouchers e detalhes.',
  aguardando_embarque: 'Contagem regressiva para o embarque.',
  em_andamento: 'Cliente está viajando.',
  pos_viagem: 'Viagem concluída.',
  concluida: 'Arquivada.',
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0)
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Tela de estado vazio quando nenhum item está selecionado. Mostra um
 * resumo da viagem (dias, valores, pendências) pro TP/PV ter noção do
 * quadro antes de mexer em items específicos.
 */
export function ViagemResumo({ viagem, items, cardTitulo }: Props) {
  const activeItems = items.filter((i) => !i.deleted_at)
  const dias = activeItems.filter((i) => i.tipo === 'dia')
  const nonDias = activeItems.filter((i) => i.tipo !== 'dia')

  const propostos = nonDias.filter((i) => i.status === 'proposto').length
  const aprovados = nonDias.filter((i) => i.status === 'aprovado').length
  const operacionais = nonDias.filter((i) => i.status === 'operacional').length

  const vouchersPendentes = nonDias.filter((i) => {
    const op = i.operacional as Record<string, unknown>
    const precisa = ['aprovado', 'operacional'].includes(i.status)
    const temVoucher = !!op?.voucher_url
    const tipoExige = !['texto', 'dica', 'checklist'].includes(i.tipo)
    return precisa && !temVoucher && tipoExige
  }).length

  const datas = activeItems
    .map((i) => {
      const op = i.operacional as { data_inicio?: string | null }
      const com = i.comercial as { data_inicio?: string | null; data?: string | null }
      return op?.data_inicio ?? com?.data_inicio ?? com?.data ?? null
    })
    .filter(Boolean) as string[]
  const primeiraData = datas.length ? datas.slice().sort()[0] : null
  const ultimaData = datas.length ? datas.slice().sort().pop() : null

  const podeEnviar = viagem.estado === 'desenho'

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-xl space-y-5">
        {/* Header viagem */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {viagem.titulo || 'Viagem sem título'}
          </h1>
          {viagem.subtitulo && (
            <p className="mt-1 text-sm text-slate-500">{viagem.subtitulo}</p>
          )}
          {cardTitulo && (
            <p className="mt-1 text-xs text-slate-400">Card: {cardTitulo}</p>
          )}
          <p className="mt-2 text-sm text-slate-600">
            {ESTADO_DESCRICAO[viagem.estado] ?? viagem.estado}
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<Calendar className="h-4 w-4" />}
            label="Dias"
            value={String(dias.length)}
          />
          <StatCard
            icon={<MapPin className="h-4 w-4" />}
            label="Itens"
            value={String(nonDias.length)}
          />
          <StatCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Total"
            value={formatBRL(viagem.total_estimado)}
          />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Passageiros"
            value="—"
            hint="via gate /v/:token"
          />
        </div>

        {/* Datas */}
        {(primeiraData || ultimaData) && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Datas conhecidas
            </h3>
            <div className="space-y-1 text-sm text-slate-700">
              {primeiraData && (
                <p>
                  <span className="text-slate-500">Primeira:</span> {formatDate(primeiraData)}
                </p>
              )}
              {ultimaData && ultimaData !== primeiraData && (
                <p>
                  <span className="text-slate-500">Última:</span> {formatDate(ultimaData)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Pipeline de status dos itens */}
        {nonDias.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Estado dos itens
            </h3>
            <div className="space-y-2">
              {propostos > 0 && (
                <StatusRow
                  color="bg-blue-500"
                  label="Propostos (cliente decide)"
                  count={propostos}
                  total={nonDias.length}
                />
              )}
              {aprovados > 0 && (
                <StatusRow
                  color="bg-emerald-500"
                  label="Aprovados"
                  count={aprovados}
                  total={nonDias.length}
                />
              )}
              {operacionais > 0 && (
                <StatusRow
                  color="bg-violet-500"
                  label="Operacional (PV)"
                  count={operacionais}
                  total={nonDias.length}
                />
              )}
            </div>
          </div>
        )}

        {/* Pendências PV */}
        {vouchersPendentes > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <Clock className="h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-amber-900">
                {vouchersPendentes} {vouchersPendentes === 1 ? 'item' : 'itens'} sem voucher anexado
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                Clique no item na árvore pra subir o voucher — a IA extrai os dados automaticamente.
              </p>
            </div>
          </div>
        )}

        {activeItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              Viagem ainda vazia.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Clique em <span className="font-medium">+ Dia</span> na árvore à esquerda, ou use
              <span className="font-medium"> ↻ Atualizar do Produto-Vendas</span> para trazer itens já fechados.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-slate-900">
                  Selecione um item na árvore à esquerda para editar
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Cada item tem abas <span className="font-medium">Operacional</span>,{' '}
                  <span className="font-medium">Comercial</span> e <span className="font-medium">Comentários</span>.
                  {podeEnviar && ' Quando estiver pronto, use o botão "Enviar ao cliente" no topo.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p>}
    </div>
  )
}

function StatusRow({ color, label, count, total }: { color: string; label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-700">{label}</span>
        <span className="text-slate-500">{count}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

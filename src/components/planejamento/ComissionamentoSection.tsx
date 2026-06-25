import { BedDouble, Package } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { PLANEJ_FIELD } from '../../hooks/planejamento/types'
import { TextField } from './fields'
import { readStr, SUB } from './fieldStyles'

/**
 * Comissionamento — a "abinha" pedida na reunião (25/06): "falta comissionamento,
 * a gente se perde muito". Hospedagem E pacote, cada um com o % que o hotel/local
 * paga, o % extra que a gente negociou em cima, o valor, QUANDO vai ser pago e o
 * CONTATO da parte que comissiona. As meninas de atendimento usam isso no Monde.
 * Tudo em produto_data (histórico automático).
 */
export function ComissionamentoSection({ wedding }: { wedding: WeddingPlanejamento }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })

  return (
    <div className="pt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ComissaoBloco
        icon={BedDouble}
        titulo="Hospedagem"
        pd={pd}
        set={set}
        keys={{
          pct: PLANEJ_FIELD.comissaoHospPct,
          extra: PLANEJ_FIELD.comissaoHospExtraPct,
          valor: PLANEJ_FIELD.comissaoHospValor,
          quando: PLANEJ_FIELD.comissaoHospQuando,
          contato: PLANEJ_FIELD.comissaoHospContato,
        }}
      />
      <ComissaoBloco
        icon={Package}
        titulo="Pacote do casamento"
        pd={pd}
        set={set}
        keys={{
          pct: PLANEJ_FIELD.comissaoPacotePct,
          extra: PLANEJ_FIELD.comissaoPacoteExtraPct,
          valor: PLANEJ_FIELD.comissaoPacoteValor,
          quando: PLANEJ_FIELD.comissaoPacoteQuando,
          contato: PLANEJ_FIELD.comissaoPacoteContato,
        }}
      />
    </div>
  )
}

function ComissaoBloco({
  icon: Icon, titulo, pd, set, keys,
}: {
  icon: LucideIcon
  titulo: string
  pd: Record<string, unknown> | null
  set: (key: string, value: unknown) => void
  keys: { pct: string; extra: string; valor: string; quando: string; contato: string }
}) {
  return (
    <div className="rounded-xl border border-[#EDE4D6] bg-[#FCFAF6] p-4">
      <p className={`${SUB} flex items-center gap-1.5 mb-3`}><Icon className="w-3.5 h-3.5" /> {titulo}</p>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Hotel/local paga (%)" type="number" value={readStr(pd, keys.pct)} placeholder="ex.: 10" onSave={(v) => set(keys.pct, v)} />
        <TextField label="Extra negociado (%)" type="number" value={readStr(pd, keys.extra)} placeholder="ex.: 15" onSave={(v) => set(keys.extra, v)} />
        <TextField label="Valor (R$)" type="number" value={readStr(pd, keys.valor)} onSave={(v) => set(keys.valor, v)} />
        <TextField label="Quando é pago" value={readStr(pd, keys.quando)} placeholder="ex.: após check-out" onSave={(v) => set(keys.quando, v)} />
        <div className="col-span-2">
          <TextField label="Contato da comissão" value={readStr(pd, keys.contato)} placeholder="nome / e-mail de quem paga" onSave={(v) => set(keys.contato, v)} />
        </div>
      </div>
    </div>
  )
}

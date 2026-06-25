import { Paperclip, Coins, CalendarX, MinusCircle, Gift } from 'lucide-react'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'
import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { PLANEJ_FIELD } from '../../hooks/planejamento/types'
import { TextAreaField } from './fields'
import { readStr, SUB } from './fieldStyles'

/**
 * Tarifas & Políticas — o conteúdo denso que chega como e-mail/PDF do hotel
 * (reunião 25/06: "informação demais"). Híbrido: campos de texto pra registrar +
 * o contrato/e-mail anexado. As políticas de CANCELAMENTO e REDUÇÃO (de quartos
 * e de noites, por data) "vêm do contrato" e a Diana pediu pra ficarem visíveis
 * — sem esperar vender quase tudo pra pedir redução. Tudo em produto_data.
 */
export function TarifasPoliticasSection({ wedding, onOpenDocs }: { wedding: WeddingPlanejamento; onOpenDocs: () => void }) {
  const { save } = usePlanejamentoCampos()
  const pd = wedding.produto_data
  const set = (key: string, value: unknown) => save.mutate({ cardId: wedding.id, values: { [key]: value } })

  return (
    <div className="pt-3 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-[12px] text-[#9A9082] [font-family:'Roboto'] max-w-xl">
          As tarifas (categoria, ocupação, descontos) e as regras de cancelamento/redução chegam no
          e-mail/contrato do hotel. Registre o essencial aqui e anexe o documento — assim qualquer
          pessoa encontra rápido.
        </p>
        <button
          type="button"
          onClick={onOpenDocs}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E0D6C8] bg-white text-[#8A6A33] text-[12.5px] font-semibold hover:bg-[#FCFAF6] shrink-0"
        >
          <Paperclip className="w-3.5 h-3.5" /> Anexar contrato / e-mail do hotel
        </button>
      </div>

      <div>
        <p className={`${SUB} flex items-center gap-1.5 mb-2`}><Coins className="w-3.5 h-3.5" /> Tarifas (categorias, ocupação, NET/base/promo)</p>
        <TextAreaField
          label="Resumo das tarifas"
          rows={4}
          value={readStr(pd, PLANEJ_FIELD.tarifasObs)}
          placeholder="Ex.: Junior Suite Deluxe — SGL US$ 393 / DBL US$ 491 / TPL US$ 675. 10% off pra aptos fechados até 29/06. Crianças 2–12 = 50% da dupla…"
          onSave={(v) => set(PLANEJ_FIELD.tarifasObs, v)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-[#F0DCD7] bg-[#FDF7F5] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#B0473C] flex items-center gap-1.5 mb-2"><CalendarX className="w-3.5 h-3.5" /> Política de cancelamento</p>
          <TextAreaField
            label="Por faixa de data (do contrato)"
            rows={4}
            value={readStr(pd, PLANEJ_FIELD.politicaCancelamento)}
            placeholder="Ex.: até 201 dias antes — 1º depósito não reembolsável; 200–121 dias — 60%; 120–91 — 80%; 90 dias até o evento — 100%."
            onSave={(v) => set(PLANEJ_FIELD.politicaCancelamento, v)}
          />
        </div>
        <div className="rounded-xl border border-[#EDE0C2] bg-[#FCF7EA] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9A7B2E] flex items-center gap-1.5 mb-2"><MinusCircle className="w-3.5 h-3.5" /> Política de redução</p>
          <TextAreaField
            label="Quartos e noites, por data (do contrato)"
            rows={4}
            value={readStr(pd, PLANEJ_FIELD.politicaReducao)}
            placeholder="Ex.: até 91 dias antes — reduz 10% sem multa; 90–61 — 5%; depois 100% dos quartos reduzidos. Vale por quartos e por noites — depende do hotel."
            onSave={(v) => set(PLANEJ_FIELD.politicaReducao, v)}
          />
        </div>
      </div>

      <div>
        <p className={`${SUB} flex items-center gap-1.5 mb-2`}><Gift className="w-3.5 h-3.5" /> Benefícios / cortesias</p>
        <TextAreaField
          label="O que o hotel dá"
          rows={2}
          value={readStr(pd, PLANEJ_FIELD.beneficios)}
          placeholder="Ex.: 1 quarto cortesia a cada 5 pagos (máx. 3); 1 upgrade a cada 10 pagos; sem taxa de wedding pass pra quem comprar fora do bloqueio…"
          onSave={(v) => set(PLANEJ_FIELD.beneficios, v)}
        />
      </div>
    </div>
  )
}

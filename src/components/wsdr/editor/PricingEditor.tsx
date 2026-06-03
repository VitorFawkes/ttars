import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { type SofiaPricing, type DestinationRange, type RevealStrategy, REVEAL_OPTIONS } from '@/components/wsdr/sofiaConfig'

export function PricingEditor({ pricing, onChange }: { pricing: SofiaPricing; onChange: (p: SofiaPricing) => void }) {
  const set = (patch: Partial<SofiaPricing>) => onChange({ ...pricing, ...patch })
  const setRange = (i: number, patch: Partial<DestinationRange>) =>
    set({ destination_ranges: pricing.destination_ranges.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) })
  const setTier = (i: number, ti: number, valor: number) =>
    setRange(i, { tiers: pricing.destination_ranges[i].tiers.map((t, idx) => (idx === ti ? { ...t, a_partir: valor } : t)) })
  const addRange = () => set({ destination_ranges: [...pricing.destination_ranges, { destino: '', moeda: 'BRL', tiers: [{ convidados: 20, a_partir: 0 }, { convidados: 50, a_partir: 0 }, { convidados: 100, a_partir: 0 }], contexto: '' }] })
  const removeRange = (i: number) => set({ destination_ranges: pricing.destination_ranges.filter((_, idx) => idx !== i) })

  return (
    <div className="space-y-5">
      {/* Assessoria */}
      <div className="space-y-3">
        <label className="flex items-center justify-between text-sm font-medium text-slate-900">
          <span>A Sofia menciona a assessoria (honorário)</span>
          <Switch checked={pricing.mention_fee} onCheckedChange={v => set({ mention_fee: v })} className={pricing.mention_fee ? 'bg-ww-gold' : ''} />
        </label>
        {pricing.mention_fee && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">De (R$)</label>
              <Input type="number" value={pricing.fee_min_brl} onChange={e => set({ fee_min_brl: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Até (R$)</label>
              <Input type="number" value={pricing.fee_max_brl} onChange={e => set({ fee_max_brl: Number(e.target.value) })} />
            </div>
          </div>
        )}
      </div>

      {/* Quando revelar */}
      <div>
        <label className="block text-sm font-medium text-slate-900 mb-1.5">Quando falar de valor</label>
        <div className="space-y-1.5">
          {REVEAL_OPTIONS.map(opt => (
            <label key={opt.value} className={cn('flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer', pricing.reveal_strategy === opt.value ? 'border-ww-gold/40 bg-ww-gold-soft/60' : 'border-slate-200 hover:border-slate-300')}>
              <input type="radio" name="reveal" className="mt-1 accent-ww-gold" checked={pricing.reveal_strategy === opt.value} onChange={() => set({ reveal_strategy: opt.value as RevealStrategy })} />
              <span><span className="text-sm font-medium text-slate-900">{opt.label}</span><span className="block text-xs text-slate-500">{opt.hint}</span></span>
            </label>
          ))}
        </div>
      </div>

      {/* Não negocia */}
      <label className="flex items-center justify-between text-sm text-slate-700 p-3 rounded-lg border border-slate-200">
        <span>Permitir que a Sofia negocie/dê desconto <span className="text-xs text-slate-400">(ela é SDR — recomendado deixar desligado)</span></span>
        <Switch checked={pricing.can_negotiate} onCheckedChange={v => set({ can_negotiate: v })} className={pricing.can_negotiate ? 'bg-ww-gold' : ''} />
      </label>

      {/* Tom ao hesitar */}
      <div>
        <label className="block text-sm font-medium text-slate-900 mb-1.5">Se o casal hesitar pelo valor</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'empathetic', label: 'Com empatia', hint: 'Acolhe, reconhece e deixa a porta aberta.' },
            { value: 'firm', label: 'Com firmeza', hint: 'Reafirma o valor e os diferenciais, sem agressividade.' },
          ] as const).map(opt => (
            <label key={opt.value} className={cn('flex flex-col gap-0.5 p-2.5 rounded-lg border cursor-pointer', pricing.tone_on_pushback === opt.value ? 'border-ww-gold/40 bg-ww-gold-soft/60' : 'border-slate-200 hover:border-slate-300')}>
              <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <input type="radio" name="pushback" className="accent-ww-gold" checked={pricing.tone_on_pushback === opt.value} onChange={() => set({ tone_on_pushback: opt.value })} />
                {opt.label}
              </span>
              <span className="text-xs text-slate-500 pl-6">{opt.hint}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Catálogo por destino */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-900">Faixas de casamento por destino <span className="text-xs font-normal text-slate-400">(a partir de, por nº de convidados)</span></p>
        {pricing.destination_ranges.map((r, i) => (
          <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/40">
            <div className="flex items-center gap-2">
              <Input value={r.destino} onChange={e => setRange(i, { destino: e.target.value })} placeholder="Destino (ex: Nordeste)" className="flex-1" />
              <Input value={r.moeda} onChange={e => setRange(i, { moeda: e.target.value })} placeholder="BRL" className="w-20" />
              <button type="button" onClick={() => removeRange(i)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {r.tiers.map((t, ti) => (
                <div key={ti}>
                  <label className="block text-[11px] text-slate-500 mb-0.5">{t.convidados} convidados</label>
                  <Input type="number" value={t.a_partir} onChange={e => setTier(i, ti, Number(e.target.value))} />
                </div>
              ))}
            </div>
            <Input value={r.contexto || ''} onChange={e => setRange(i, { contexto: e.target.value })} placeholder="Contexto (o que inclui / observações)" />
          </div>
        ))}
        <button type="button" onClick={addRange} className="flex items-center gap-1.5 text-sm text-ww-gold-ink hover:text-ww-gold"><Plus className="w-4 h-4" />Adicionar destino</button>
      </div>
    </div>
  )
}

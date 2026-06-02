import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { type AberturaMode, ABERTURA_MODE_OPTIONS } from '@/components/wsdr/sofiaConfig'
import { SuggestVariations } from '@/components/wsdr/editor/SuggestVariations'

const VARIABLES: { token: string; desc: string }[] = [
  { token: '{{contact_name}}', desc: 'nome do casal' },
  { token: '{{agent_name}}', desc: 'nome da Sofia' },
  { token: '{{company_name}}', desc: 'nome da empresa' },
  { token: '{{date}}', desc: 'data de hoje' },
]

// Mensagem de abertura com 3 modos: texto exato, só uma diretriz (a Sofia compõe),
// ou livre (ela abre sozinha). Vira o bloco <primeira_mensagem> no cérebro.
export function OpeningEditor({
  mode, abertura, onChange,
}: {
  mode: AberturaMode
  abertura: string
  onChange: (patch: { abertura_mode?: AberturaMode; abertura?: string }) => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-2">
        {ABERTURA_MODE_OPTIONS.map(o => {
          const active = mode === o.value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange({ abertura_mode: o.value })}
              className={cn(
                'text-left p-3 rounded-lg border transition-all active:scale-[0.99]',
                active ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'
              )}
            >
              <p className={cn('text-sm font-medium', active ? 'text-indigo-900' : 'text-slate-700')}>{o.label}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{o.hint}</p>
            </button>
          )
        })}
      </div>

      {mode === 'free' ? (
        <p className="text-xs text-slate-500 bg-slate-50/70 border border-slate-200 rounded-lg p-3">
          A Sofia vai compor a abertura sozinha, seguindo a persona e a descrição da empresa (aba "Quem é a Sofia"). Você não precisa escrever nada aqui.
        </p>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-slate-900">
              {mode === 'literal' ? 'O texto exato da primeira mensagem' : 'A diretriz da abertura (o que ela deve fazer)'}
            </label>
            <SuggestVariations text={abertura} fieldType={mode === 'literal' ? 'anchor_text' : 'custom'} onPick={t => onChange({ abertura: t })} />
          </div>
          <Textarea
            value={abertura}
            onChange={e => onChange({ abertura: e.target.value })}
            className="min-h-[140px]"
            placeholder={mode === 'literal'
              ? 'Oi! Aqui é a Sofia, da Welcome Weddings…'
              : 'Ex: Se apresente de leve, diga que a gente faz destination wedding, pergunte o nome do casal e o que imaginam. Não fale de preço ainda.'}
          />
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'literal'
              ? 'A Sofia manda exatamente isto no primeiro contato (ignora o que o casal escreveu).'
              : 'A Sofia cobre estes pontos E responde ao que o casal escreveu na 1ª mensagem, como um SDR humano. Não copia palavra por palavra.'}
          </p>
        </div>
      )}

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-700">Variáveis que você pode usar</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {VARIABLES.map(v => (
            <span key={v.token} className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-2 py-1">
              <code className="text-[11px] text-indigo-700">{v.token}</code>
              <span className="text-[11px] text-slate-400">{v.desc}</span>
            </span>
          ))}
        </div>
      </details>
    </div>
  )
}

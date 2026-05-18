/**
 * Capítulo 7 — Em quais números ela atende? (EDITÁVEL)
 */

import { useState } from 'react'
import { Phone, AlertTriangle, Power, X } from 'lucide-react'
import {
  Card, Pill, Toggle, ChapterHeader,
  RowActions, AddButton, InlineAdd,
} from './Ui'
import { PHONE_LINES, TEST_WHITELIST, PATRICIA, type PhoneLine } from './data-real'

function fmtPhone(raw: string): string {
  if (raw.length === 13 && raw.startsWith('55'))
    return `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4, 9)}-${raw.slice(9)}`
  if (raw.length === 12 && raw.startsWith('55'))
    return `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4, 8)}-${raw.slice(8)}`
  if (raw.length === 11)
    return `${raw.slice(0, 2)} ${raw.slice(2, 7)}-${raw.slice(7)}`
  return raw
}

export function Cap7Linhas() {
  const [active, setActive] = useState(PATRICIA.ativa)
  const [lines, setLines] = useState<PhoneLine[]>(PHONE_LINES)
  const [whitelist, setWhitelist] = useState<string[]>(TEST_WHITELIST)
  const [adding, setAdding] = useState<'line' | 'phone' | null>(null)

  const addLine = (label: string) => {
    setLines([...lines, {
      vinculo_id: crypto.randomUUID(),
      label,
      produto: PATRICIA.produto,
      ativa: true,
    }])
    setAdding(null)
  }
  const removeLine = (id: string) => setLines(lines.filter(l => l.vinculo_id !== id))
  const toggleLine = (id: string, ativa: boolean) => {
    setLines(lines.map(l => l.vinculo_id === id ? { ...l, ativa } : l))
  }

  const addPhone = (phone: string) => {
    const clean = phone.replace(/\D/g, '')
    if (clean) setWhitelist([...whitelist, clean])
    setAdding(null)
  }
  const removePhone = (p: string) => setWhitelist(whitelist.filter(x => x !== p))

  const inTestMode = whitelist.length > 0

  return (
    <article>
      <ChapterHeader
        num={7}
        total={7}
        title="Em quais números ela atende?"
        subtitle="As linhas WhatsApp conectadas e quem pode falar com ela."
      />

      <div className="space-y-5">
        <Card>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 ${
              active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>
              <Power className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Status geral</p>
              <p className="text-[15px] font-semibold text-slate-900 mt-0.5">
                Patricia {active ? 'está atendendo' : 'está pausada'}
              </p>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Quando pausada, nenhuma mensagem é processada.
              </p>
            </div>
            <Toggle checked={active} onChange={setActive} />
          </div>
        </Card>

        {inTestMode && (
          <Card actions={<AddButton label="Adicionar telefone" onClick={() => setAdding('phone')} />}>
            <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-amber-900">
                    Modo de teste ativo — Patricia só responde a {whitelist.length} número{whitelist.length > 1 ? 's' : ''}
                  </p>
                  <p className="text-[12px] text-amber-800 mt-1 leading-relaxed">
                    Mensagens de fora dessa lista são ignoradas.
                  </p>
                </div>
                <button
                  onClick={() => setWhitelist([])}
                  className="text-[11px] font-medium text-amber-900 hover:text-amber-700 underline whitespace-nowrap"
                >
                  Sair do modo teste
                </button>
              </div>
              <ul className="grid grid-cols-2 gap-1.5">
                {whitelist.map(p => (
                  <li key={p} className="group flex items-center justify-between text-[12px] font-mono text-amber-900 bg-white border border-amber-200 rounded px-2 py-1">
                    <span>{fmtPhone(p)}</span>
                    <button
                      onClick={() => removePhone(p)}
                      className="opacity-30 group-hover:opacity-100 text-rose-600 hover:bg-rose-100 rounded transition-opacity"
                      aria-label="Remover"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
              {adding === 'phone' && (
                <div className="mt-3">
                  <InlineAdd placeholder="Telefone (com DDI, ex: 5511999998888)" onAdd={addPhone} onCancel={() => setAdding(null)} />
                </div>
              )}
            </div>
          </Card>
        )}

        <Card
          title={`Linhas WhatsApp (${lines.filter(l => l.ativa).length} de ${lines.length} ativas)`}
          hint="Patricia só responde nas linhas marcadas como ativas."
          actions={<AddButton label="Adicionar linha" onClick={() => setAdding('line')} />}
        >
          <ul className="space-y-2">
            {lines.map(line => (
              <li key={line.vinculo_id} className="group flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white">
                <div className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${
                  line.ativa ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                }`}>
                  <Phone className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-900">{line.label}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Pill tone="slate">produto: {line.produto}</Pill>
                    <span className="text-[10px] font-mono text-slate-400">
                      vínculo {line.vinculo_id.slice(0, 8)}…
                    </span>
                  </div>
                </div>
                <Toggle checked={line.ativa} onChange={(v) => toggleLine(line.vinculo_id, v)} />
                <RowActions onRemove={() => removeLine(line.vinculo_id)} />
              </li>
            ))}
            {adding === 'line' && (
              <li>
                <InlineAdd placeholder="Nome da linha (ex: SP — promoções)" onAdd={addLine} onCancel={() => setAdding(null)} />
              </li>
            )}
          </ul>
        </Card>
      </div>
    </article>
  )
}

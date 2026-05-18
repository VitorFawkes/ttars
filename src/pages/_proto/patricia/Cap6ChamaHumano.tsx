/**
 * Capítulo 6 — Quando ela chama um humano? (TOTALMENTE EDITÁVEL)
 *
 * Liberdade aplicada:
 *  - Adicionar / remover / editar descrição dos sinais de handoff
 *  - Adicionar / remover / editar peso, label, tipo das 15 regras de pontuação
 *  - Editar threshold
 *  - Editar template de mensagem
 *  - Editar parâmetros de agendamento
 */

import { useState } from 'react'
import { Users, Calendar, Tag, Bell } from 'lucide-react'
import {
  Card, Toggle, TextArea, ChapterHeader,
  RowActions, AddButton, InlineAdd, InlineEdit,
} from './Ui'
import {
  HANDOFF_SIGNALS, HANDOFF_ACTIONS, WEDDING_PLANNER,
  SCORING_RULES, SCORING_THRESHOLD,
  type ScoringRule, type HandoffSignal,
} from './data-real'

export function Cap6ChamaHumano() {
  const [signals, setSignals] = useState<HandoffSignal[]>(HANDOFF_SIGNALS)
  const [rules, setRules] = useState<ScoringRule[]>(SCORING_RULES)
  const [threshold, setThreshold] = useState(SCORING_THRESHOLD)
  const [message, setMessage] = useState(HANDOFF_ACTIONS.message_template)
  const [adding, setAdding] = useState<'signal' | 'rule' | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [duracao, setDuracao] = useState(HANDOFF_ACTIONS.book_meeting.duracao_minutos)
  const [slotsDia, setSlotsDia] = useState(HANDOFF_ACTIONS.book_meeting.slots_per_day)
  const [diasUteis, setDiasUteis] = useState(HANDOFF_ACTIONS.book_meeting.business_days_ahead)

  const addSignal = (slug: string) => {
    setSignals([...signals, { slug: slug.replace(/\s+/g, '_').toLowerCase(), description: '(clique pra editar)', enabled: true }])
    setAdding(null)
  }
  const removeSignal = (slug: string) => setSignals(signals.filter(s => s.slug !== slug))
  const editSignal = (slug: string, desc: string) => {
    setSignals(signals.map(s => s.slug === slug ? { ...s, description: desc } : s))
    setEditing(null)
  }
  const toggleSignal = (slug: string, on: boolean) => {
    setSignals(signals.map(s => s.slug === slug ? { ...s, enabled: on } : s))
  }

  const addRule = (label: string) => {
    setRules([...rules, { label, weight: 5, type: 'qualify', group: null }])
    setAdding(null)
  }
  const removeRule = (label: string) => setRules(rules.filter(r => r.label !== label))
  const editRule = (oldLabel: string, partial: Partial<ScoringRule>) => {
    setRules(rules.map(r => r.label === oldLabel ? { ...r, ...partial } : r))
  }

  return (
    <article>
      <ChapterHeader
        num={6}
        total={7}
        title="Quando ela chama um humano?"
        subtitle="Sinais que disparam handoff, pontuação que decide quem qualifica, e o que acontece quando Patricia passa o bastão."
      />

      <div className="space-y-5">
        <Card title="Pra quem ela passa">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center flex-shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-slate-900">{WEDDING_PLANNER.nome}</p>
              <p className="text-[12px] text-slate-500 font-mono">{WEDDING_PLANNER.email}</p>
            </div>
            <button className="text-[12px] font-medium text-indigo-600 hover:text-indigo-700">
              Trocar responsável
            </button>
          </div>
        </Card>

        <Card
          title={`Sinais que disparam handoff (${signals.filter(s => s.enabled).length} de ${signals.length} ativos)`}
          hint="Patricia escala quando detecta qualquer sinal ativo."
          actions={<AddButton label="Adicionar sinal" onClick={() => setAdding('signal')} />}
        >
          <div className="space-y-1">
            {signals.map(s => (
              <div
                key={s.slug}
                className="group flex items-start gap-3 py-2 px-2 rounded hover:bg-slate-50 transition-colors"
              >
                <Toggle checked={s.enabled} onChange={(v) => toggleSignal(s.slug, v)} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-900 capitalize">
                    {s.slug.replace(/_/g, ' ')}
                  </p>
                  {editing === `signal:${s.slug}` ? (
                    <div className="mt-1">
                      <InlineEdit
                        value={s.description}
                        onSave={(v) => editSignal(s.slug, v)}
                        onCancel={() => setEditing(null)}
                        multiline
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 leading-relaxed">{s.description}</p>
                  )}
                </div>
                <RowActions
                  onEdit={() => setEditing(`signal:${s.slug}`)}
                  onRemove={() => removeSignal(s.slug)}
                />
              </div>
            ))}
            {adding === 'signal' && (
              <div className="pt-2">
                <InlineAdd
                  placeholder="Nome do sinal (ex: cliente_pediu_orcamento)"
                  onAdd={addSignal}
                  onCancel={() => setAdding(null)}
                />
              </div>
            )}
          </div>
        </Card>

        <Card
          title="Pontuação — soma de pontos pra qualificar"
          hint={`${rules.length} regras. Patricia agenda reunião quando o score atinge o mínimo.`}
          actions={<AddButton label="Adicionar regra" onClick={() => setAdding('rule')} />}
        >
          <div className="flex items-center gap-3 p-3 bg-indigo-50/40 border border-indigo-200 rounded-lg mb-4">
            <span className="text-[12px] font-medium text-indigo-900">Score mínimo:</span>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value) || 0)}
              className="w-16 px-2 py-1 text-[13px] font-mono tabular-nums bg-white border border-indigo-300 rounded focus:ring-2 focus:ring-indigo-100 outline-none"
            />
            <span className="text-[12px] text-indigo-700">pontos</span>
          </div>

          <ScoringList rules={rules} editRule={editRule} removeRule={removeRule} editing={editing} setEditing={setEditing} />

          {adding === 'rule' && (
            <div className="mt-3">
              <InlineAdd
                placeholder="Nome da regra (ex: Destino na Costa Rica)"
                onAdd={addRule}
                onCancel={() => setAdding(null)}
              />
            </div>
          )}
        </Card>

        <Card title="O que acontece quando Patricia escala">
          <div className="space-y-3">
            <div className="border border-slate-200 rounded-lg p-3 bg-white">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 grid place-items-center">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <p className="text-[13px] font-semibold text-slate-900 flex-1">Agenda reunião automática</p>
                <Toggle checked={HANDOFF_ACTIONS.book_meeting.enabled} />
              </div>
              <div className="grid grid-cols-3 gap-3 pl-11">
                <NumField label="Duração (min)" value={duracao} onChange={setDuracao} />
                <NumField label="Slots por dia" value={slotsDia} onChange={setSlotsDia} />
                <NumField label="Dias úteis" value={diasUteis} onChange={setDiasUteis} />
              </div>
            </div>

            <ActionRow icon={Tag} title={`Tag "${HANDOFF_ACTIONS.apply_tag.name}"`} detail={`Cor ${HANDOFF_ACTIONS.apply_tag.color}`} enabled />
            <ActionRow icon={Users} title={`Move pra "${HANDOFF_ACTIONS.change_stage.label}"`} detail="Marca progresso no Kanban." enabled />
            <ActionRow icon={Bell} title="Notifica Ana Carolina" detail="Alerta no CRM + email." enabled={HANDOFF_ACTIONS.notify_responsible} />
          </div>
        </Card>

        <Card title="Mensagem ao cliente" hint="Texto que Patricia envia ao confirmar a reunião.">
          <TextArea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
            {['{contact_name}', '{responsavel_first_name}', '{data}', '{hora}'].map(v => (
              <code key={v} className="font-mono bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">{v}</code>
            ))}
          </div>
        </Card>
      </div>
    </article>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="mt-1 w-full px-2 py-1 text-[13px] font-mono tabular-nums bg-white border border-slate-200 rounded focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
      />
    </label>
  )
}

function ActionRow({
  icon: Icon, title, detail, enabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail: string
  enabled: boolean
}) {
  return (
    <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg bg-white">
      <div className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${
        enabled ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-400'
      }`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-slate-900">{title}</p>
        <p className="text-[11px] text-slate-500">{detail}</p>
      </div>
      <Toggle checked={enabled} />
    </div>
  )
}

const GROUP_LABEL: Record<string, string> = {
  destino: 'Destino',
  valor_convidado: 'Valor por convidado',
  qualify: 'Outros sinais positivos',
  bonus: 'Bônus',
  disqualify: 'Desqualificações',
}

function ScoringList({
  rules, editRule, removeRule, editing, setEditing,
}: {
  rules: ScoringRule[]
  editRule: (label: string, partial: Partial<ScoringRule>) => void
  removeRule: (label: string) => void
  editing: string | null
  setEditing: (v: string | null) => void
}) {
  const groups: Record<string, ScoringRule[]> = {}
  for (const r of rules) {
    const key = r.group ?? r.type
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([group, rs]) => (
        <div key={group}>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
            {GROUP_LABEL[group] ?? group}
          </p>
          <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden bg-white">
            {rs.map(r => {
              const editKey = `rule:${r.label}`
              const isEditing = editing === editKey
              return (
                <li key={r.label} className="group flex items-center gap-3 px-3 py-2">
                  <input
                    type="number"
                    value={r.weight}
                    onChange={(e) => editRule(r.label, { weight: parseInt(e.target.value) || 0 })}
                    className={`w-14 px-2 py-1 text-[12px] font-mono tabular-nums text-right bg-white border rounded focus:ring-2 focus:ring-indigo-100 outline-none ${
                      r.type === 'disqualify' ? 'border-rose-200 text-rose-700' :
                      r.weight > 0 ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-500'
                    }`}
                  />

                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <InlineEdit
                        value={r.label}
                        onSave={(v) => { editRule(r.label, { label: v }); setEditing(null) }}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <span
                        className="text-[12px] text-slate-700 cursor-pointer hover:text-indigo-700"
                        onClick={() => setEditing(editKey)}
                      >
                        {r.label}
                      </span>
                    )}
                  </div>

                  <select
                    value={r.type}
                    onChange={(e) => editRule(r.label, { type: e.target.value as ScoringRule['type'] })}
                    className="text-[10px] font-medium bg-transparent border border-slate-200 rounded px-1 py-0.5 focus:ring-2 focus:ring-indigo-100 outline-none"
                  >
                    <option value="qualify">qualifica</option>
                    <option value="bonus">bônus</option>
                    <option value="disqualify">desqualifica</option>
                  </select>

                  <RowActions
                    onEdit={() => setEditing(editKey)}
                    onRemove={() => removeRule(r.label)}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

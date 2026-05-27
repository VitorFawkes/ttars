import { useState } from 'react'
import { Plus, X, CalendarClock } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useFilterProfiles } from '@/hooks/analytics/useFilterOptions'
import {
  type AgentEditorForm,
  type SchedulingConfig,
  type SchedulingWindow,
  DEFAULT_SCHEDULING_CONFIG,
} from './types'
import { cn } from '@/lib/utils'

/**
 * Expande janelas em lista de horários. Usado pra preview na UI —
 * espelha a lógica do backend (expandAvailableHours em _utils.ts).
 */
function expandWindowsPreview(windows: SchedulingWindow[], stepMinutes: number): string[] {
  const step = Math.max(15, stepMinutes)
  const result: string[] = []
  const seen = new Set<string>()
  for (const w of windows) {
    const [fH, fM] = (w.from || '00:00').split(':').map((s) => Number(s) || 0)
    const [tH, tM] = (w.to || '00:00').split(':').map((s) => Number(s) || 0)
    const fromMin = fH * 60 + fM
    const toMin = tH * 60 + tM
    if (toMin <= fromMin) continue
    for (let m = fromMin; m < toMin; m += step) {
      const h = Math.floor(m / 60)
      const mm = m % 60
      const key = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push(key)
      }
    }
  }
  return result
}

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

/**
 * Editor de Agenda da agente (Patricia / single_agent_v2).
 *
 * Configura:
 * - Wedding Planner responsável pela reunião (profile do workspace)
 * - Horários disponíveis (available_hours)
 * - Distribuição dos slots oferecidos ao casal (max_slots_per_day, max_days, total_slots)
 * - Filtros (skip_weekends, search_window_days, date_format)
 *
 * Quando o agente não tem `scheduling_config` setado (null), o router usa
 * defaults seguros — esse editor permite override pela UI sem deploy.
 */
export function SchedulingConfigEditor({ form, setForm }: Props) {
  const { data: profiles = [] } = useFilterProfiles()

  const config = form.scheduling_config ?? DEFAULT_SCHEDULING_CONFIG
  const isCustom = form.scheduling_config !== null

  const profileOptions = [
    { value: '', label: '— escolha uma pessoa —' },
    ...profiles.map((p) => ({ value: p.id, label: p.nome })),
  ]

  const updateProfile = (id: string) => {
    setForm((f) => ({ ...f, wedding_planner_profile_id: id || null }))
  }

  const updateConfig = (patch: Partial<SchedulingConfig>) => {
    setForm((f) => ({
      ...f,
      scheduling_config: {
        ...(f.scheduling_config ?? DEFAULT_SCHEDULING_CONFIG),
        ...patch,
      },
    }))
  }

  const enableCustom = (enabled: boolean) => {
    setForm((f) => ({
      ...f,
      scheduling_config: enabled ? { ...DEFAULT_SCHEDULING_CONFIG } : null,
    }))
  }

  const [newHour, setNewHour] = useState('')
  const addHour = () => {
    const v = newHour.trim()
    if (!/^\d{1,2}:\d{2}$/.test(v)) return
    const [hh, mm] = v.split(':')
    const normalized = `${hh.padStart(2, '0')}:${mm}`
    if (config.available_hours.includes(normalized)) return
    const next = [...config.available_hours, normalized].sort()
    updateConfig({ available_hours: next })
    setNewHour('')
  }
  const removeHour = (h: string) => {
    updateConfig({ available_hours: config.available_hours.filter((x) => x !== h) })
  }

  // Modo de configuração de horários: janelas (padrão) ou lista discreta.
  // Detecta o modo ativo: se há windows, é "windows"; senão "list".
  const hoursMode: 'windows' | 'list' = (config.available_windows && config.available_windows.length > 0)
    ? 'windows'
    : 'list'

  const setHoursMode = (mode: 'windows' | 'list') => {
    if (mode === 'windows') {
      updateConfig({
        available_windows: config.available_windows.length > 0
          ? config.available_windows
          : DEFAULT_SCHEDULING_CONFIG.available_windows,
        slot_duration_minutes: config.slot_duration_minutes || 60,
      })
    } else {
      updateConfig({ available_windows: [], available_hours: config.available_hours.length > 0 ? config.available_hours : ['10:00', '14:00', '16:00'] })
    }
  }

  const addWindow = () => {
    updateConfig({
      available_windows: [...config.available_windows, { from: '09:00', to: '12:00' }],
    })
  }
  const updateWindow = (idx: number, patch: Partial<SchedulingWindow>) => {
    updateConfig({
      available_windows: config.available_windows.map((w, i) => (i === idx ? { ...w, ...patch } : w)),
    })
  }
  const removeWindow = (idx: number) => {
    updateConfig({
      available_windows: config.available_windows.filter((_, i) => i !== idx),
    })
  }

  const generatedHours = hoursMode === 'windows'
    ? expandWindowsPreview(config.available_windows, config.slot_duration_minutes || 60)
    : config.available_hours

  const selectedProfile = profiles.find((p) => p.id === form.wedding_planner_profile_id)

  return (
    <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-5 h-5 text-indigo-600" />
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Agenda da reunião</h3>
          <p className="text-xs text-slate-500">
            Quem recebe a reunião e como os horários são oferecidos ao casal no desfecho qualificado.
          </p>
        </div>
      </div>

      {/* Wedding Planner */}
      <div className="space-y-2">
        <Label className="text-xs text-slate-700">Wedding Planner responsável</Label>
        <Select
          value={form.wedding_planner_profile_id ?? ''}
          onChange={(v: string) => updateProfile(v)}
          options={profileOptions}
        />
        <p className="text-[11px] text-slate-500">
          Quando configurada, o router filtra a agenda real apenas pelas reuniões dessa pessoa e cria a reunião nela. Sem isso, qualquer reunião da org bloqueia slots e a tool de agendamento falha.
        </p>
        {selectedProfile && (
          <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
            ✓ Agendamentos vão para <strong>{selectedProfile.nome}</strong>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <Label className="text-xs text-slate-700">Customizar oferta de horários</Label>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isCustom
                ? 'Configurações ativas para esse agente.'
                : 'Usando defaults seguros (3 dias úteis × até 6 horários por dia, formato "14/05"). Ative para customizar.'}
            </p>
          </div>
          <Switch checked={isCustom} onCheckedChange={enableCustom} />
        </div>

        {isCustom && (
          <div className="space-y-5 mt-4 pl-3 border-l-2 border-indigo-100">
            {/* Horários disponíveis — toggle Janelas vs Lista */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-slate-700">Horários disponíveis na agenda</Label>
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setHoursMode('windows')}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-medium rounded',
                      hoursMode === 'windows' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    Janelas (recomendado)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHoursMode('list')}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-medium rounded',
                      hoursMode === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    Lista
                  </button>
                </div>
              </div>

              {hoursMode === 'windows' ? (
                <>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Faixas contínuas de atendimento + duração de cada slot. Ex: manhã 09:00–12:00 e tarde 14:00–18:00 a cada 1h gera 09, 10, 11, 14, 15, 16, 17.
                  </p>
                  <div className="space-y-1.5">
                    {config.available_windows.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md p-2">
                        <span className="text-[11px] text-slate-600">De</span>
                        <Input
                          value={w.from}
                          onChange={(e) => updateWindow(i, { from: e.target.value })}
                          placeholder="09:00"
                          className="w-20 text-xs"
                        />
                        <span className="text-[11px] text-slate-600">até</span>
                        <Input
                          value={w.to}
                          onChange={(e) => updateWindow(i, { to: e.target.value })}
                          placeholder="12:00"
                          className="w-20 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => removeWindow(i)}
                          className="ml-auto text-slate-400 hover:text-rose-600"
                          aria-label="Remover janela"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {config.available_windows.length === 0 && (
                      <p className="text-[11px] text-rose-700">⚠ Sem janelas — adicione pelo menos uma.</p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={addWindow} className="mt-2 gap-1">
                    <Plus className="w-3.5 h-3.5" /> Adicionar janela
                  </Button>

                  <div className="mt-3 max-w-[220px]">
                    <Label className="text-[11px] text-slate-700 mb-1 block">Duração de cada slot</Label>
                    <Select
                      value={String(config.slot_duration_minutes || 60)}
                      onChange={(v: string) => updateConfig({ slot_duration_minutes: Number(v) })}
                      options={[
                        { value: '15', label: '15 minutos' },
                        { value: '30', label: '30 minutos' },
                        { value: '45', label: '45 minutos' },
                        { value: '60', label: '1 hora' },
                        { value: '90', label: '1h30' },
                        { value: '120', label: '2 horas' },
                      ]}
                    />
                  </div>

                  <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] text-slate-600 mb-1">
                      <strong>Horários gerados:</strong> {generatedHours.length === 0 ? '(nenhum)' : ''}
                    </p>
                    {generatedHours.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {generatedHours.map((h) => (
                          <span key={h} className="bg-indigo-100 text-indigo-800 rounded px-1.5 py-0.5 text-[10px] font-mono">
                            {h}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Lista discreta de horários. Use quando as faixas não forem contínuas (ex: só 10h, 14h e 16h).
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {config.available_hours.map((h) => (
                      <span
                        key={h}
                        className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-800 rounded-md px-2 py-0.5 text-xs font-medium"
                      >
                        {h}
                        <button
                          type="button"
                          onClick={() => removeHour(h)}
                          className="hover:text-indigo-950"
                          aria-label={`Remover ${h}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {config.available_hours.length === 0 && (
                      <span className="text-[11px] text-rose-700">⚠ Sem horários — o router vai cair em defaults.</span>
                    )}
                  </div>
                  <div className="flex gap-2 max-w-xs">
                    <Input
                      value={newHour}
                      onChange={(e) => setNewHour(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addHour()
                        }
                      }}
                      placeholder="14:00"
                      className="text-xs"
                    />
                    <Button size="sm" variant="outline" onClick={addHour}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Distribuição: max_slots_per_day, max_days, total_slots */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-700 mb-1 block">
                  Horários por dia (max)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={config.max_slots_per_day}
                  onChange={(e) => updateConfig({ max_slots_per_day: Math.max(1, Number(e.target.value) || 1) })}
                />
                <p className="text-[10px] text-slate-500 mt-1">Quantos horários do MESMO dia oferecer</p>
              </div>
              <div>
                <Label className="text-xs text-slate-700 mb-1 block">
                  Dias diferentes (max)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={14}
                  value={config.max_days}
                  onChange={(e) => updateConfig({ max_days: Math.max(1, Number(e.target.value) || 1) })}
                />
                <p className="text-[10px] text-slate-500 mt-1">Quantos dias distintos cobrir</p>
              </div>
              <div>
                <Label className="text-xs text-slate-700 mb-1 block">
                  Total de slots (cap)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={config.total_slots}
                  onChange={(e) => updateConfig({ total_slots: Math.max(1, Number(e.target.value) || 1) })}
                />
                <p className="text-[10px] text-slate-500 mt-1">Limite total de slots numa mensagem</p>
              </div>
            </div>

            {/* search_window + skip_weekends + date_format */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-700 mb-1 block">
                  Janela de busca (dias)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={config.search_window_days}
                  onChange={(e) => updateConfig({ search_window_days: Math.max(1, Number(e.target.value) || 1) })}
                />
                <p className="text-[10px] text-slate-500 mt-1">Quantos dias à frente buscar</p>
              </div>
              <div>
                <Label className="text-xs text-slate-700 mb-1 block">
                  Formato da data
                </Label>
                <Select
                  value={config.date_format}
                  onChange={(v: string) => updateConfig({ date_format: v as 'short' | 'full' })}
                  options={[
                    { value: 'short', label: 'Curto (14/05)' },
                    { value: 'full', label: 'Completo (14/05/2026)' },
                  ]}
                />
                <p className="text-[10px] text-slate-500 mt-1">Como a data aparece na mensagem</p>
              </div>
              <div className="flex flex-col">
                <Label className="text-xs text-slate-700 mb-1 block">
                  Pular finais de semana
                </Label>
                <div className="flex items-center gap-2 h-9">
                  <Switch
                    checked={config.skip_weekends}
                    onCheckedChange={(v) => updateConfig({ skip_weekends: v })}
                  />
                  <span className="text-xs text-slate-600">
                    {config.skip_weekends ? 'Sim — só dias úteis' : 'Não — sábado/domingo OK'}
                  </span>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className={cn(
              'rounded-md border px-3 py-2 text-[11px]',
              config.available_hours.length > 0
                ? 'bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            )}>
              <strong>Preview da oferta:</strong>{' '}
              {config.available_hours.length > 0
                ? `até ${config.total_slots} slots (${config.max_slots_per_day}/dia × ${config.max_days} dias) em horários ${config.available_hours.join(', ')}${config.skip_weekends ? ', pulando finais de semana' : ''}, formato ${config.date_format === 'short' ? '"14/05"' : '"14/05/2026"'}.`
                : 'Sem horários cadastrados — vai cair em defaults.'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

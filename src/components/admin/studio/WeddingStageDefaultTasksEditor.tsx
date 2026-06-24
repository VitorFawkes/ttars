import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Loader2, Lock, Bell, Paperclip } from 'lucide-react'
import { sbAny } from '../../../hooks/convidados/_supabaseUntyped'
import { WEDDING_TASK_TYPES, WEDDING_TASK_TIPO_LIST } from '../../../hooks/planejamento/taskTypes'
import type { WeddingTaskTipo } from '../../../hooks/planejamento/types'
import { cn } from '../../../lib/utils'

interface DefaultTask {
  id: string
  stage_id: string
  org_id: string
  titulo: string
  tipo: WeddingTaskTipo
  dias_prazo: number | null
  trava: boolean
  gera_cobranca: boolean
  abre_doc: boolean
  marco: string | null
  ordem: number
  ativo: boolean
}

type Draft = Partial<DefaultTask>

const QKEY = (stageId: string) => ['wedding-stage-default-tasks', stageId]

/**
 * Editor das TAREFAS-PADRÃO de uma etapa do pos_venda WEDDING
 * (wedding_stage_default_tasks). O dono/Diana editam sem dev: título, tipo, prazo
 * (dias), trava 🔒, cobrança 🔁, abre-doc 📎, ativo. Editar aqui muda o que
 * casamentos NOVOS recebem ao entrar na etapa.
 */
export default function WeddingStageDefaultTasksEditor({ stageId }: { stageId: string }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)

  const { data: tasks, isLoading } = useQuery({
    queryKey: QKEY(stageId),
    enabled: !!stageId,
    queryFn: async () => {
      const { data, error } = await sbAny
        .from('wedding_stage_default_tasks')
        .select('*')
        .eq('stage_id', stageId)
        .order('ordem', { ascending: true })
      if (error) throw error
      return (data ?? []) as DefaultTask[]
    },
  })

  // marco padrão pra tarefas novas: o mais comum entre as existentes da etapa
  // (faz a tarefa nova cair no mesmo grupo da etapa na espinha do casamento).
  const defaultMarco = (() => {
    const counts = new Map<string, number>()
    for (const t of tasks ?? []) {
      if (t.marco) counts.set(t.marco, (counts.get(t.marco) ?? 0) + 1)
    }
    let best: string | null = null
    let max = 0
    for (const [m, c] of counts) if (c > max) { max = c; best = m }
    return best
  })()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QKEY(stageId) })

  const upsert = useMutation({
    mutationFn: async (p: Draft) => {
      if (p.id) {
        const { error } = await sbAny
          .from('wedding_stage_default_tasks')
          .update({
            titulo: p.titulo,
            tipo: p.tipo,
            dias_prazo: p.dias_prazo ?? null,
            trava: p.trava ?? false,
            gera_cobranca: p.gera_cobranca ?? false,
            abre_doc: p.abre_doc ?? false,
            ordem: p.ordem,
            ativo: p.ativo,
          })
          .eq('id', p.id)
        if (error) throw error
      } else {
        const { error } = await sbAny.from('wedding_stage_default_tasks').insert({
          stage_id: stageId,
          titulo: p.titulo,
          tipo: p.tipo || 'tarefa',
          dias_prazo: p.dias_prazo ?? null,
          trava: p.trava ?? false,
          gera_cobranca: p.gera_cobranca ?? false,
          abre_doc: p.abre_doc ?? false,
          marco: defaultMarco,
          ordem: p.ordem ?? (tasks?.length ?? 0),
          ativo: true,
        })
        if (error) throw error
      }
    },
    onSuccess: () => { invalidate(); setDraft(null) },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny.from('wedding_stage_default_tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await sbAny.from('wedding_stage_default_tasks').update({ ativo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 p-3">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando tarefas-padrão…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {(tasks ?? []).map((t) => {
        const meta = WEDDING_TASK_TYPES[t.tipo] ?? WEDDING_TASK_TYPES.tarefa
        const Icon = meta.icon
        return (
          <div
            key={t.id}
            className={cn('flex items-start gap-2 p-3 rounded-lg border', t.ativo ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60')}
          >
            <span className={cn('w-6 h-6 rounded-md grid place-items-center shrink-0 border mt-0.5', meta.bg, meta.border)} title={meta.label}>
              <Icon className={cn('w-3.5 h-3.5', meta.color)} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-slate-900">{t.titulo}</span>
                {t.trava && <Badge tone="rose" icon={Lock} label="trava" />}
                {t.gera_cobranca && <Badge tone="amber" icon={Bell} label="cobrança" />}
                {t.abre_doc && <Badge tone="indigo" icon={Paperclip} label="abre doc" />}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {meta.label} · {t.dias_prazo == null ? 'sem prazo' : `prazo ${t.dias_prazo}d`}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setDraft(t)}
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100"
                title="Editar"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => toggleAtivo.mutate({ id: t.id, ativo: !t.ativo })}
                className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0', t.ativo ? 'bg-indigo-600' : 'bg-slate-300')}
                title={t.ativo ? 'Desativar' : 'Ativar'}
              >
                <span className={cn('inline-block h-3 w-3 transform rounded-full bg-white transition-transform', t.ativo ? 'translate-x-5' : 'translate-x-1')} />
              </button>
              <button
                type="button"
                onClick={() => { if (confirm(`Remover a tarefa-padrão "${t.titulo}"?`)) del.mutate(t.id) }}
                className="p-1 text-slate-400 hover:text-rose-600"
                title="Remover"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      })}

      {draft ? (
        <DraftEditor
          draft={draft}
          setDraft={setDraft}
          saving={upsert.isPending}
          onSave={() => upsert.mutate(draft)}
          onCancel={() => setDraft(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setDraft({ titulo: '', tipo: 'tarefa', dias_prazo: null, trava: false, gera_cobranca: false, abre_doc: false })}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-indigo-600 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50"
        >
          <Plus className="w-4 h-4" /> Adicionar tarefa-padrão
        </button>
      )}

      {(tasks ?? []).length === 0 && !draft && (
        <p className="text-xs text-slate-500 text-center py-2">
          Nenhuma tarefa-padrão nesta etapa. As tarefas criadas aqui serão geradas automaticamente quando um casamento entrar nesta etapa.
        </p>
      )}
    </div>
  )
}

function Badge({ tone, icon: Icon, label }: { tone: 'rose' | 'amber' | 'indigo'; icon: typeof Lock; label: string }) {
  const tones: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-600 border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium', tones[tone])}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  )
}

function DraftEditor({
  draft,
  setDraft,
  saving,
  onSave,
  onCancel,
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="p-3 border border-indigo-200 rounded-lg bg-indigo-50/40 space-y-2">
      <input
        type="text"
        autoFocus
        placeholder="Título da tarefa (ex.: Fechar o bloqueio com o hotel)"
        value={draft.titulo ?? ''}
        onChange={(e) => setDraft({ ...draft, titulo: e.target.value })}
        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={draft.tipo ?? 'tarefa'}
          onChange={(e) => setDraft({ ...draft, tipo: e.target.value as WeddingTaskTipo })}
          className="px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {WEDDING_TASK_TIPO_LIST.map((t) => (
            <option key={t} value={t}>{WEDDING_TASK_TYPES[t].label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={365}
            placeholder="—"
            value={draft.dias_prazo ?? ''}
            onChange={(e) => setDraft({ ...draft, dias_prazo: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10)) })}
            className="w-16 px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <span className="text-xs text-slate-500">dias de prazo</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FlagToggle label="🔒 trava a etapa" active={!!draft.trava} onClick={() => setDraft({ ...draft, trava: !draft.trava })} />
        <FlagToggle label="🔁 gera cobrança" active={!!draft.gera_cobranca} onClick={() => setDraft({ ...draft, gera_cobranca: !draft.gera_cobranca })} />
        <FlagToggle label="📎 abre documento" active={!!draft.abre_doc} onClick={() => setDraft({ ...draft, abre_doc: !draft.abre_doc })} />
      </div>
      <p className="text-[11px] text-slate-400">As marcações 🔒/🔁/📎 já ficam salvas; passam a agir (travar o avanço e cobrar sozinhas) na próxima fase.</p>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">Cancelar</button>
        <button
          type="button"
          disabled={!draft.titulo?.trim() || saving}
          onClick={onSave}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : draft.id ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </div>
  )
}

function FlagToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('px-2 py-1 rounded-md border text-[12px] font-medium', active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')}
    >
      {label}
    </button>
  )
}

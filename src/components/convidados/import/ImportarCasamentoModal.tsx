import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, UploadCloud, ArrowLeft, ArrowRight, Loader2,
  CheckCircle2, AlertTriangle, Link as LinkIcon, Plus, ExternalLink,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useOrg } from '../../../contexts/OrgContext'
import {
  parseXlsxFile,
  type ParseResult,
  type WeddingGroup,
} from './parseXlsx'
import {
  findCardMatches,
  useImportarCasamento,
  type GroupPlan,
  type MatchAction,
  type ImportSummary,
} from '../../../hooks/convidados/useImportarCasamento'

interface ImportarCasamentoModalProps {
  open: boolean
  onClose: () => void
}

type Step = 'upload' | 'matching' | 'preview' | 'importing' | 'results'

interface GroupState {
  group: WeddingGroup
  action: MatchAction
  // Sugestões carregadas
  matchByCodigo: { id: string, titulo: string } | null
  matchByTitle: { id: string, titulo: string }[]
  loadingMatch: boolean
}

export function ImportarCasamentoModal({ open, onClose }: ImportarCasamentoModalProps) {
  const { org } = useOrg()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [groupStates, setGroupStates] = useState<GroupState[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  const { execute, progress, running } = useImportarCasamento()

  useEffect(() => {
    if (!open) {
      // Reset estado quando modal fecha
      setStep('upload')
      setFile(null)
      setParseError(null)
      setParsing(false)
      setParseResult(null)
      setGroupStates([])
      setImportError(null)
      setSummary(null)
    }
  }, [open])

  if (!open) return null

  async function handleFile(f: File) {
    setFile(f)
    setParsing(true)
    setParseError(null)
    try {
      const result = await parseXlsxFile(f)
      if (result.groups.length === 0) {
        setParseError('Não encontrei nenhum casamento na planilha. Confere se ela segue o formato esperado.')
        setParseResult(null)
      } else {
        setParseResult(result)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setParseError(`Não consegui ler o arquivo: ${msg}`)
    } finally {
      setParsing(false)
    }
  }

  async function goToMatching() {
    if (!parseResult || !org?.id) return
    setStep('matching')
    // Inicializa estado dos grupos: ação default = criar novo
    const initial: GroupState[] = parseResult.groups.map(g => ({
      group: g,
      action: { kind: 'create' },
      matchByCodigo: null,
      matchByTitle: [],
      loadingMatch: true,
    }))
    setGroupStates(initial)

    // Roda match em paralelo
    const updated = await Promise.all(
      parseResult.groups.map(async (group) => {
        try {
          const m = await findCardMatches(org.id, group)
          let action: MatchAction
          if (m.byCodigo) {
            action = { kind: 'update', cardId: m.byCodigo.id, fillBlank: false }
          } else {
            action = { kind: 'create' }
          }
          return {
            group,
            action,
            matchByCodigo: m.byCodigo ? { id: m.byCodigo.id, titulo: m.byCodigo.titulo } : null,
            matchByTitle: m.byTitle.map(c => ({ id: c.id, titulo: c.titulo })),
            loadingMatch: false,
          } as GroupState
        } catch {
          return {
            group,
            action: { kind: 'create' } as MatchAction,
            matchByCodigo: null,
            matchByTitle: [],
            loadingMatch: false,
          }
        }
      }),
    )
    setGroupStates(updated)
  }

  function updateGroupAction(codigo: string, action: MatchAction) {
    setGroupStates(prev => prev.map(gs => (gs.group.codigo === codigo ? { ...gs, action } : gs)))
  }

  async function startImport() {
    setStep('importing')
    setImportError(null)
    try {
      const plans: GroupPlan[] = groupStates.map(gs => ({ group: gs.group, action: gs.action }))
      const result = await execute(plans)
      setSummary(result)
      setStep('results')
    } catch (e) {
      console.error('[ImportarCasamento] erro:', e)
      setImportError(formatImportError(e))
      setStep('matching')
    }
  }

  const totalGuests = parseResult?.groups.reduce((acc, g) => acc + g.guests.length, 0) ?? 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Importar planilha</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Importa casamentos e convidados de um arquivo XLSX
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper indicator */}
        <div className="px-6 py-3 border-b border-slate-100">
          <Stepper current={step} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'upload' && (
            <UploadStep
              file={file}
              parsing={parsing}
              parseResult={parseResult}
              parseError={parseError}
              totalGuests={totalGuests}
              onFile={handleFile}
            />
          )}
          {step === 'matching' && (
            <MatchingStep
              groupStates={groupStates}
              onActionChange={updateGroupAction}
              importError={importError}
            />
          )}
          {step === 'preview' && (
            <PreviewStep groupStates={groupStates} />
          )}
          {step === 'importing' && (
            <ImportingStep progress={progress} />
          )}
          {step === 'results' && summary && (
            <ResultsStep summary={summary} onGoCard={(id) => { onClose(); navigate(`/convidados/casamento/${id}`) }} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          >
            {step === 'results' ? 'Fechar' : 'Cancelar'}
          </button>
          <div className="flex items-center gap-2">
            {step === 'matching' && (
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
            )}
            {step === 'preview' && (
              <button
                type="button"
                onClick={() => setStep('matching')}
                className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
            )}
            {step === 'upload' && parseResult && (
              <button
                type="button"
                onClick={goToMatching}
                className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
              >
                Continuar <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 'matching' && (
              <button
                type="button"
                onClick={() => setStep('preview')}
                disabled={groupStates.some(gs => gs.loadingMatch)}
                className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                Revisar <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 'preview' && (
              <button
                type="button"
                onClick={startImport}
                disabled={running}
                className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:bg-slate-300"
              >
                Importar agora <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatImportError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    const parts = [
      typeof obj.message === 'string' ? obj.message : null,
      typeof obj.code === 'string' ? `(${obj.code})` : null,
      typeof obj.details === 'string' ? obj.details : null,
      typeof obj.hint === 'string' ? `dica: ${obj.hint}` : null,
    ].filter(Boolean)
    if (parts.length > 0) return parts.join(' · ')
    try { return JSON.stringify(e) } catch { return String(e) }
  }
  return String(e)
}

const STEPS: { key: Step, label: string }[] = [
  { key: 'upload', label: 'Arquivo' },
  { key: 'matching', label: 'Casamentos' },
  { key: 'preview', label: 'Revisão' },
  { key: 'results', label: 'Pronto' },
]

function Stepper({ current }: { current: Step }) {
  const stepOrder: Step[] = ['upload', 'matching', 'preview', 'importing', 'results']
  const currentIndex = stepOrder.indexOf(current)
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((s, i) => {
        // 'importing' compartilha posição com 'preview' visualmente
        const stepIndex = s.key === 'results' ? 4 : i
        const reachedIndex = current === 'importing' ? 2 : currentIndex
        const isDone = stepIndex < reachedIndex
        const isCurrent = stepIndex === reachedIndex
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold',
                isDone && 'bg-emerald-100 text-emerald-700',
                isCurrent && 'bg-indigo-600 text-white',
                !isDone && !isCurrent && 'bg-slate-100 text-slate-500',
              )}
            >
              {isDone ? '✓' : i + 1}
            </span>
            <span className={cn(
              'font-medium',
              isCurrent ? 'text-slate-900' : 'text-slate-500',
            )}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="text-slate-300">·</span>}
          </li>
        )
      })}
    </ol>
  )
}

// ─── Step: Upload ────────────────────────────────────────────────────────

interface UploadStepProps {
  file: File | null
  parsing: boolean
  parseResult: ParseResult | null
  parseError: string | null
  totalGuests: number
  onFile: (f: File) => void
}

function UploadStep({ file, parsing, parseResult, parseError, totalGuests, onFile }: UploadStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <label
        className="block border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:bg-slate-50 transition-colors"
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
          }}
        />
        <UploadCloud className="w-10 h-10 mx-auto text-slate-400" />
        <p className="mt-3 text-sm font-medium text-slate-900">
          {file ? file.name : 'Selecione um arquivo .xlsx'}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          A planilha precisa ter o cabeçalho na primeira linha. Cada linha é um convidado.
        </p>
      </label>

      {parsing && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Lendo planilha…
        </div>
      )}

      {parseError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-md px-3 py-2 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {parseError}
        </div>
      )}

      {parseResult && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md px-3 py-2 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Encontrei <strong>{parseResult.groups.length}</strong> casamento{parseResult.groups.length === 1 ? '' : 's'} e <strong>{totalGuests}</strong> convidado{totalGuests === 1 ? '' : 's'}.
          </div>
          {(parseResult.rowsSemCodigo > 0 || parseResult.rowsSemNome > 0) && (
            <p className="text-xs text-emerald-700/80 mt-1">
              {parseResult.rowsSemCodigo > 0 && `${parseResult.rowsSemCodigo} linha(s) sem código de casamento foram ignoradas. `}
              {parseResult.rowsSemNome > 0 && `${parseResult.rowsSemNome} linha(s) sem nome foram ignoradas.`}
            </p>
          )}
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Formato esperado das colunas:</p>
        <p className="mt-1">
          A=Nome · B=Sobrenome · C=Telefone · D=Email · <strong>E=Código do Casamento</strong> · F=Nome do Casamento · G=Local · H/I=Data · J=Site · K=Data final · M=Link Atendimento
        </p>
      </div>
    </div>
  )
}

// ─── Step: Matching ──────────────────────────────────────────────────────

interface MatchingStepProps {
  groupStates: GroupState[]
  onActionChange: (codigo: string, action: MatchAction) => void
  importError: string | null
}

function MatchingStep({ groupStates, onActionChange, importError }: MatchingStepProps) {
  return (
    <div className="flex flex-col gap-3">
      {importError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-md px-3 py-2 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> Não rolou a importação: {importError}
        </div>
      )}
      <p className="text-xs text-slate-500">
        Para cada casamento da planilha, escolha se quer ligar a um card existente ou criar um novo.
      </p>
      {groupStates.map(gs => (
        <GroupCard
          key={gs.group.codigo}
          state={gs}
          onChange={(action) => onActionChange(gs.group.codigo, action)}
        />
      ))}
    </div>
  )
}

interface GroupCardProps {
  state: GroupState
  onChange: (action: MatchAction) => void
}

function GroupCard({ state, onChange }: GroupCardProps) {
  const { group, action, matchByCodigo, matchByTitle, loadingMatch } = state

  const hasSuggestion = !!matchByCodigo || matchByTitle.length > 0

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 truncate">{group.titulo}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Código: <code className="bg-slate-100 px-1 rounded text-[11px]">{group.codigo}</code> · {group.guests.length} convidado{group.guests.length === 1 ? '' : 's'}
            {group.data_evento_iso && ` · ${group.data_evento_iso}`}
            {group.local && ` · ${group.local}`}
          </p>
        </div>
        {loadingMatch && <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />}
      </div>

      {!loadingMatch && (
        <div className="mt-3 flex flex-col gap-2">
          {matchByCodigo && (
            <OptionRow
              selected={action.kind === 'update' && action.cardId === matchByCodigo.id}
              onClick={() =>
                onChange({
                  kind: 'update',
                  cardId: matchByCodigo.id,
                  fillBlank: action.kind === 'update' ? action.fillBlank : false,
                })
              }
              icon={<LinkIcon className="w-4 h-4 text-indigo-600" />}
              title={`Ligar a "${matchByCodigo.titulo}"`}
              subtitle="Card existente com o mesmo código de casamento"
            >
              {action.kind === 'update' && action.cardId === matchByCodigo.id && (
                <label className="flex items-center gap-2 text-xs text-slate-700 mt-1">
                  <input
                    type="checkbox"
                    checked={action.fillBlank}
                    onChange={(e) => onChange({ kind: 'update', cardId: matchByCodigo.id, fillBlank: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  Atualizar campos vazios do card com os dados da planilha
                </label>
              )}
            </OptionRow>
          )}

          {!matchByCodigo && matchByTitle.length > 0 && (
            <div className="border border-amber-200 bg-amber-50/50 rounded-md p-2">
              <p className="text-xs text-amber-800 font-medium mb-1">
                {matchByTitle.length === 1 ? 'Talvez seja este card?' : 'Cards com nome parecido encontrados:'}
              </p>
              {matchByTitle.map(c => (
                <OptionRow
                  key={c.id}
                  selected={action.kind === 'update' && action.cardId === c.id}
                  onClick={() => onChange({ kind: 'update', cardId: c.id, fillBlank: false })}
                  icon={<LinkIcon className="w-4 h-4 text-amber-700" />}
                  title={`Ligar a "${c.titulo}"`}
                  subtitle="Match por nome (verifica se é o mesmo casamento)"
                >
                  {action.kind === 'update' && action.cardId === c.id && (
                    <label className="flex items-center gap-2 text-xs text-slate-700 mt-1">
                      <input
                        type="checkbox"
                        checked={action.fillBlank}
                        onChange={(e) => onChange({ kind: 'update', cardId: c.id, fillBlank: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                      Atualizar campos vazios do card com os dados da planilha
                    </label>
                  )}
                </OptionRow>
              ))}
            </div>
          )}

          <OptionRow
            selected={action.kind === 'create'}
            onClick={() => onChange({ kind: 'create' })}
            icon={<Plus className="w-4 h-4 text-emerald-600" />}
            title="Criar card novo"
            subtitle={hasSuggestion
              ? 'Ignora as sugestões e cria um casamento novo no funil'
              : 'Nenhum card existente combinou — vamos criar um novo'}
          />

          <OptionRow
            selected={action.kind === 'skip'}
            onClick={() => onChange({ kind: 'skip' })}
            icon={<X className="w-4 h-4 text-slate-500" />}
            title="Pular este casamento"
            subtitle="Não importa nada deste grupo"
          />
        </div>
      )}
    </div>
  )
}

interface OptionRowProps {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
  children?: React.ReactNode
}

function OptionRow({ selected, onClick, icon, title, subtitle, children }: OptionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md border px-3 py-2 transition-colors',
        selected
          ? 'border-indigo-400 bg-indigo-50/40'
          : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
          {children}
        </div>
        <span className={cn(
          'inline-block w-4 h-4 rounded-full border-2 shrink-0',
          selected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white',
        )}>
          {selected && <span className="block w-1.5 h-1.5 m-0.5 rounded-full bg-white" />}
        </span>
      </div>
    </button>
  )
}

// ─── Step: Preview ───────────────────────────────────────────────────────

function PreviewStep({ groupStates }: { groupStates: GroupState[] }) {
  const summary = useMemo(() => {
    let toCreate = 0
    let toUpdate = 0
    let toUse = 0
    let toSkip = 0
    let totalGuests = 0
    let invalidRows = 0
    for (const gs of groupStates) {
      if (gs.action.kind === 'skip') {
        toSkip++
        continue
      }
      if (gs.action.kind === 'create') toCreate++
      else if (gs.action.kind === 'update') toUpdate++
      else if (gs.action.kind === 'use') toUse++
      totalGuests += gs.group.guests.length
      invalidRows += gs.group.guests.filter(g => g.errors.length > 0).length
    }
    return { toCreate, toUpdate, toUse, toSkip, totalGuests, invalidRows }
  }, [groupStates])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <SummaryCard label="Criar novos" value={summary.toCreate} tone="emerald" />
        <SummaryCard label="Atualizar existentes" value={summary.toUpdate + summary.toUse} tone="indigo" />
        <SummaryCard label="Convidados" value={summary.totalGuests} tone="slate" />
        <SummaryCard label="Pular" value={summary.toSkip} tone="slate" />
      </div>

      {summary.invalidRows > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {summary.invalidRows} linha(s) com telefone ou email inválido. Vou pular essas linhas durante o import.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {groupStates.filter(gs => gs.action.kind !== 'skip').map(gs => (
          <div key={gs.group.codigo} className="border border-slate-200 rounded-md p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 truncate">{gs.group.titulo}</h3>
              <ActionBadge action={gs.action} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {gs.group.guests.length} convidado{gs.group.guests.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-2 text-xs text-slate-600 space-y-0.5">
              {gs.group.guests.slice(0, 5).map(g => (
                <li key={g.rowIndex} className="flex items-center gap-2">
                  <span className="font-medium text-slate-700 truncate">
                    {g.nome}{g.sobrenome ? ` ${g.sobrenome}` : ''}
                  </span>
                  {g.telefone && <span className="text-slate-500">· {g.telefone}</span>}
                  {g.email && <span className="text-slate-400 truncate">· {g.email}</span>}
                  {g.errors.length > 0 && (
                    <span className="text-rose-600 text-[10px]">({g.errors.join(', ')})</span>
                  )}
                </li>
              ))}
              {gs.group.guests.length > 5 && (
                <li className="text-slate-400">+ {gs.group.guests.length - 5} convidados…</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActionBadge({ action }: { action: MatchAction }) {
  if (action.kind === 'create') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">Criar novo</span>
  }
  if (action.kind === 'update') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700">
      Atualizar{action.fillBlank ? ' (campos vazios)' : ''}
    </span>
  }
  if (action.kind === 'use') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700">Anexar convidados</span>
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">Pular</span>
}

function SummaryCard({ label, value, tone }: { label: string, value: number, tone: 'emerald' | 'indigo' | 'slate' }) {
  const toneClass = {
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    indigo: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    slate: 'text-slate-700 bg-slate-50 border-slate-200',
  }[tone]
  return (
    <div className={cn('border rounded-md px-3 py-2', toneClass)}>
      <p className="text-[10px] uppercase tracking-wide font-semibold opacity-70">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

// ─── Step: Importing ─────────────────────────────────────────────────────

function ImportingStep({ progress }: { progress: { current: number, total: number, label: string } | null }) {
  const pct = progress ? Math.min(100, Math.round((progress.current / Math.max(progress.total, 1)) * 100)) : 0
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      <p className="text-sm font-medium text-slate-900">Importando…</p>
      <div className="w-full max-w-md h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-500">{progress?.label ?? 'Preparando…'}</p>
    </div>
  )
}

// ─── Step: Results ───────────────────────────────────────────────────────

function ResultsStep({ summary, onGoCard }: { summary: ImportSummary, onGoCard: (cardId: string) => void }) {
  const totalErrors = summary.results.reduce((acc, r) => acc + r.rowErrors.length, 0)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <SummaryCard label="Cards criados" value={summary.cardsCreated} tone="emerald" />
        <SummaryCard label="Cards atualizados" value={summary.cardsUpdated} tone="indigo" />
        <SummaryCard label="Convidados novos" value={summary.guestsCreated} tone="emerald" />
        <SummaryCard label="Já existiam" value={summary.guestsSkipped} tone="slate" />
      </div>

      {totalErrors > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2 text-sm">
          {totalErrors} linha(s) tiveram problema. Detalhes abaixo.
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {summary.results.map(r => (
          <li key={r.codigo} className="border border-slate-200 rounded-md p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 truncate">{r.titulo}</h3>
              {r.cardId && (
                <button
                  type="button"
                  onClick={() => onGoCard(r.cardId as string)}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Ver casamento <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {r.cardCreated && 'Card criado · '}
              {r.cardUpdated && 'Card atualizado · '}
              {r.guestsCreated} novo{r.guestsCreated === 1 ? '' : 's'}, {r.guestsSkippedDup} já existia{r.guestsSkippedDup === 1 ? '' : 'm'}
            </p>
            {r.rowErrors.length > 0 && (
              <ul className="mt-2 text-xs text-rose-700 list-disc pl-5">
                {r.rowErrors.slice(0, 5).map((er, i) => (
                  <li key={i}>linha {er.rowIndex}: {er.message}</li>
                ))}
                {r.rowErrors.length > 5 && <li>+ {r.rowErrors.length - 5} outras</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

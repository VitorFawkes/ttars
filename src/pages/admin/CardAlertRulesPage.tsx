import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Plus, Pencil, Trash2, Play, Loader2, Power, PowerOff, Eye } from 'lucide-react'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '../../components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import {
    useCardAlertRules,
    type CardAlertRule,
    type CardAlertRuleInput,
    type AlertSeverity,
    type TriggerMode,
    type PreviewResult,
} from '../../hooks/useCardAlertRules'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas fora dos types gerados
const db = supabase as any

interface FormState {
    name: string
    description: string
    severity: AlertSeverity
    scope_type: 'product' | 'pipeline' | 'phase' | 'stage' | 'all'
    scope_value: string
    condition_json: string
    trigger_mode: TriggerMode
    title_template: string
    body_template: string
    send_email: boolean
}

const emptyForm: FormState = {
    name: '',
    description: '',
    severity: 'warning',
    scope_type: 'stage',
    scope_value: '',
    condition_json: '{\n  "type": "stage_requirements"\n}',
    trigger_mode: 'daily_cron',
    title_template: 'Card "{titulo}" precisa de ajuste',
    body_template: 'Campos pendentes: {missing_fields}',
    send_email: false,
}

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
    info: 'bg-sky-50 text-sky-700 border-sky-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    critical: 'bg-red-50 text-red-700 border-red-200',
}

const TRIGGER_LABELS: Record<TriggerMode, string> = {
    daily_cron: 'Diariamente (6h)',
    on_card_enter: 'Ao entrar no stage',
    on_card_open: 'Na 1ª abertura',
    on_field_change: 'Ao editar campo',
}

export default function CardAlertRulesPage() {
    const { profile } = useAuth()
    const isAdmin = profile?.is_admin === true

    const {
        rules,
        isLoading,
        createRule,
        updateRule,
        deleteRule,
        previewRule,
        runRuleNow,
        isRunning,
        isMutating,
    } = useCardAlertRules()

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingRule, setEditingRule] = useState<CardAlertRule | null>(null)
    const [form, setForm] = useState<FormState>(emptyForm)
    const [deleteCandidate, setDeleteCandidate] = useState<CardAlertRule | null>(null)
    const [preview, setPreview] = useState<PreviewResult | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [jsonError, setJsonError] = useState<string | null>(null)

    // Opções de escopo — pipelines / fases / stages / produtos
    const { data: pipelines } = useQuery({
        queryKey: ['pipelines-for-alert-rules'],
        queryFn: async () => {
            const { data, error } = await db.from('pipelines').select('id, nome, produto').order('nome')
            if (error) throw error
            return data as { id: string; nome: string; produto: string | null }[]
        },
    })

    const { data: phases } = useQuery({
        queryKey: ['phases-for-alert-rules'],
        queryFn: async () => {
            const { data, error } = await db
                .from('pipeline_phases')
                .select('id, name, slug')
                .order('order_index')
            if (error) throw error
            return data as { id: string; name: string; slug: string }[]
        },
    })

    const { data: stages } = useQuery({
        queryKey: ['stages-for-alert-rules'],
        queryFn: async () => {
            const { data, error } = await db
                .from('pipeline_stages')
                .select('id, nome, pipeline_id, phase_id, ordem')
                .eq('ativo', true)
                .order('ordem')
            if (error) throw error
            return data as { id: string; nome: string; pipeline_id: string; phase_id: string; ordem: number }[]
        },
    })

    const { data: products } = useQuery({
        queryKey: ['products-for-alert-rules'],
        queryFn: async () => {
            const { data, error } = await db.from('products').select('slug, name').order('name')
            if (error) return []
            return data as { slug: string; name: string }[]
        },
    })

    const scopeLabel = (rule: CardAlertRule): string => {
        if (rule.stage_id) {
            const st = stages?.find((s) => s.id === rule.stage_id)
            return st ? `Stage: ${st.nome}` : 'Stage específico'
        }
        if (rule.phase_id) {
            const ph = phases?.find((p) => p.id === rule.phase_id)
            return ph ? `Fase: ${ph.name}` : 'Fase específica'
        }
        if (rule.pipeline_id) {
            const pp = pipelines?.find((p) => p.id === rule.pipeline_id)
            return pp ? `Pipeline: ${pp.nome}` : 'Pipeline específico'
        }
        if (rule.product) return `Produto: ${rule.product}`
        return 'Todos os cards'
    }

    const openCreate = () => {
        setEditingRule(null)
        setForm(emptyForm)
        setPreview(null)
        setJsonError(null)
        setIsModalOpen(true)
    }

    const openEdit = (rule: CardAlertRule) => {
        setEditingRule(rule)
        const scopeType: FormState['scope_type'] = rule.stage_id
            ? 'stage'
            : rule.phase_id
              ? 'phase'
              : rule.pipeline_id
                ? 'pipeline'
                : rule.product
                  ? 'product'
                  : 'all'
        const scopeValue =
            rule.stage_id || rule.phase_id || rule.pipeline_id || rule.product || ''
        setForm({
            name: rule.name,
            description: rule.description ?? '',
            severity: rule.severity,
            scope_type: scopeType,
            scope_value: scopeValue,
            condition_json: JSON.stringify(rule.condition, null, 2),
            trigger_mode: rule.trigger_mode,
            title_template: rule.title_template,
            body_template: rule.body_template ?? '',
            send_email: rule.send_email,
        })
        setPreview(null)
        setJsonError(null)
        setIsModalOpen(true)
    }

    const parseCondition = (): Record<string, unknown> | null => {
        try {
            const parsed = JSON.parse(form.condition_json)
            if (typeof parsed !== 'object' || parsed === null) {
                setJsonError('Condição deve ser um objeto JSON')
                return null
            }
            setJsonError(null)
            return parsed
        } catch (e) {
            setJsonError((e as Error).message)
            return null
        }
    }

    const buildInput = (): CardAlertRuleInput | null => {
        if (!form.name.trim()) {
            toast.error('Nome é obrigatório')
            return null
        }
        if (!form.title_template.trim()) {
            toast.error('Template de título é obrigatório')
            return null
        }
        const condition = parseCondition()
        if (!condition) return null

        // Exige valor de escopo quando scope_type != 'all'
        if (form.scope_type !== 'all' && !form.scope_value) {
            toast.error('Selecione um valor para o escopo escolhido (ou use "Todos")')
            return null
        }

        const scopeValue = form.scope_value || null

        const input: CardAlertRuleInput = {
            name: form.name,
            description: form.description || null,
            severity: form.severity,
            condition,
            trigger_mode: form.trigger_mode,
            title_template: form.title_template,
            body_template: form.body_template || null,
            send_email: form.send_email,
            pipeline_id: form.scope_type === 'pipeline' ? scopeValue : null,
            phase_id: form.scope_type === 'phase' ? scopeValue : null,
            stage_id: form.scope_type === 'stage' ? scopeValue : null,
            product: form.scope_type === 'product' ? scopeValue : null,
        }
        return input
    }

    const handlePreview = async () => {
        const input = buildInput()
        if (!input) return
        setPreviewLoading(true)
        try {
            const result = await previewRule(input)
            setPreview(result)
        } catch (e) {
            toast.error('Erro ao prever: ' + (e as Error).message)
        } finally {
            setPreviewLoading(false)
        }
    }

    const handleSave = async () => {
        const input = buildInput()
        if (!input) return
        try {
            if (editingRule) {
                await updateRule({ id: editingRule.id, ...input })
                toast.success('Regra atualizada')
            } else {
                await createRule(input)
                toast.success('Regra criada (desativada por padrão)')
            }
            setIsModalOpen(false)
        } catch (e) {
            toast.error('Erro: ' + (e as Error).message)
        }
    }

    const toggleActive = async (rule: CardAlertRule) => {
        try {
            await updateRule({ id: rule.id, is_active: !rule.is_active })
            toast.success(rule.is_active ? 'Regra desativada' : 'Regra ativada')
        } catch (e) {
            toast.error('Erro: ' + (e as Error).message)
        }
    }

    const handleRunNow = async (rule: CardAlertRule) => {
        try {
            const result = await runRuleNow(rule.id)
            toast.success(
                `Regra executada: ${result.created} criados, ${result.removed} removidos`
            )
        } catch (e) {
            toast.error('Erro ao executar: ' + (e as Error).message)
        }
    }

    const confirmDelete = async () => {
        if (!deleteCandidate) return
        try {
            await deleteRule(deleteCandidate.id)
            toast.success('Regra excluída')
            setDeleteCandidate(null)
        } catch (e) {
            toast.error('Erro: ' + (e as Error).message)
        }
    }

    const stats = useMemo(
        () => [
            { label: 'Total', value: rules.length, color: 'gray' as const },
            {
                label: 'Ativas',
                value: rules.filter((r) => r.is_active).length,
                color: 'green' as const,
            },
            {
                label: 'Críticas',
                value: rules.filter((r) => r.severity === 'critical').length,
                color: 'red' as const,
            },
        ],
        [rules]
    )

    if (!isAdmin) {
        return (
            <div className="p-8 text-center text-slate-500">
                Apenas administradores podem acessar esta página.
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6">
            <AdminPageHeader
                title="Alertas de Cards"
                subtitle="Configure regras para notificar donos de cards quando precisam de ajuste"
                icon={<AlertTriangle className="w-6 h-6 text-amber-600" />}
                stats={stats}
                actions={
                    <Button onClick={openCreate} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Nova regra
                    </Button>
                }
            />

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
            ) : rules.length === 0 ? (
                <div className="text-center p-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                    <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 font-medium">Nenhuma regra configurada</p>
                    <p className="text-sm text-slate-500 mt-1">
                        Crie uma regra para começar a enviar alertas automáticos aos donos dos cards.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {rules.map((rule) => (
                        <div
                            key={rule.id}
                            className={cn(
                                'bg-white border border-slate-200 rounded-xl p-4 shadow-sm',
                                !rule.is_active && 'opacity-60'
                            )}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-semibold text-slate-900 truncate">
                                            {rule.name}
                                        </h3>
                                        <span
                                            className={cn(
                                                'text-[11px] font-medium px-2 py-0.5 rounded border',
                                                SEVERITY_COLORS[rule.severity]
                                            )}
                                        >
                                            {rule.severity}
                                        </span>
                                        {!rule.is_active && (
                                            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                                inativa
                                            </span>
                                        )}
                                    </div>
                                    {rule.description && (
                                        <p className="text-sm text-slate-500 mb-2">{rule.description}</p>
                                    )}
                                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                                        <span>{scopeLabel(rule)}</span>
                                        <span>•</span>
                                        <span>{TRIGGER_LABELS[rule.trigger_mode]}</span>
                                        <span>•</span>
                                        <span>Tipo: {(rule.condition.type as string) || 'custom'}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleRunNow(rule)}
                                        disabled={isRunning}
                                        title="Executar agora"
                                    >
                                        {isRunning ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Play className="w-4 h-4" />
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => toggleActive(rule)}
                                        title={rule.is_active ? 'Desativar' : 'Ativar'}
                                    >
                                        {rule.is_active ? (
                                            <PowerOff className="w-4 h-4 text-slate-500" />
                                        ) : (
                                            <Power className="w-4 h-4 text-emerald-600" />
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => openEdit(rule)}
                                        title="Editar"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setDeleteCandidate(rule)}
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de criação/edição */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingRule ? 'Editar regra' : 'Nova regra de alerta'}
                        </DialogTitle>
                        <DialogDescription>
                            Configure quem recebe alerta, em que cards, com que frequência e com qual
                            mensagem.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1">
                                Nome *
                            </label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="Ex: Pós-venda sem Número Monde"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1">
                                Descrição
                            </label>
                            <Textarea
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="Explicação opcional"
                                rows={2}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">
                                    Severidade
                                </label>
                                <select
                                    value={form.severity}
                                    onChange={(e) =>
                                        setForm({ ...form, severity: e.target.value as AlertSeverity })
                                    }
                                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                                >
                                    <option value="info">Info</option>
                                    <option value="warning">Warning</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1">
                                    Disparo
                                </label>
                                <select
                                    value={form.trigger_mode}
                                    onChange={(e) =>
                                        setForm({ ...form, trigger_mode: e.target.value as TriggerMode })
                                    }
                                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                                >
                                    <option value="daily_cron">Diariamente (6h BRT)</option>
                                    <option value="on_card_enter">
                                        Ao entrar no stage
                                    </option>
                                    <option value="on_card_open">
                                        Na 1ª abertura do card
                                    </option>
                                    <option value="on_field_change">
                                        Ao editar campo relevante
                                    </option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1">
                                Escopo (quais cards avaliar)
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={form.scope_type}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            scope_type: e.target.value as FormState['scope_type'],
                                            scope_value: '',
                                        })
                                    }
                                    className="border border-slate-200 rounded-md px-3 py-2 text-sm"
                                >
                                    <option value="all">Todos</option>
                                    <option value="product">Por produto</option>
                                    <option value="pipeline">Por pipeline</option>
                                    <option value="phase">Por fase</option>
                                    <option value="stage">Por stage</option>
                                </select>

                                {form.scope_type === 'stage' && (
                                    <select
                                        value={form.scope_value}
                                        onChange={(e) =>
                                            setForm({ ...form, scope_value: e.target.value })
                                        }
                                        className="border border-slate-200 rounded-md px-3 py-2 text-sm"
                                    >
                                        <option value="">Selecionar stage…</option>
                                        {stages?.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.nome}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {form.scope_type === 'phase' && (
                                    <select
                                        value={form.scope_value}
                                        onChange={(e) =>
                                            setForm({ ...form, scope_value: e.target.value })
                                        }
                                        className="border border-slate-200 rounded-md px-3 py-2 text-sm"
                                    >
                                        <option value="">Selecionar fase…</option>
                                        {phases?.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {form.scope_type === 'pipeline' && (
                                    <select
                                        value={form.scope_value}
                                        onChange={(e) =>
                                            setForm({ ...form, scope_value: e.target.value })
                                        }
                                        className="border border-slate-200 rounded-md px-3 py-2 text-sm"
                                    >
                                        <option value="">Selecionar pipeline…</option>
                                        {pipelines?.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.nome}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {form.scope_type === 'product' && (
                                    <select
                                        value={form.scope_value}
                                        onChange={(e) =>
                                            setForm({ ...form, scope_value: e.target.value })
                                        }
                                        className="border border-slate-200 rounded-md px-3 py-2 text-sm"
                                    >
                                        <option value="">Selecionar produto…</option>
                                        {products?.map((p) => (
                                            <option key={p.slug} value={p.slug}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1">
                                Condição (JSON)
                            </label>
                            <p className="text-xs text-slate-500 mb-1">
                                Tipos: <code className="bg-slate-100 px-1 rounded">stage_requirements</code>,{' '}
                                <code className="bg-slate-100 px-1 rounded">field_missing</code>,{' '}
                                <code className="bg-slate-100 px-1 rounded">no_contact</code>,{' '}
                                <code className="bg-slate-100 px-1 rounded">contact_missing_data</code>,{' '}
                                <code className="bg-slate-100 px-1 rounded">days_in_stage</code>,{' '}
                                <code className="bg-slate-100 px-1 rounded">and</code>/
                                <code className="bg-slate-100 px-1 rounded">or</code>/
                                <code className="bg-slate-100 px-1 rounded">not</code>
                            </p>
                            <Textarea
                                value={form.condition_json}
                                onChange={(e) => setForm({ ...form, condition_json: e.target.value })}
                                rows={6}
                                className="font-mono text-xs"
                            />
                            {jsonError && (
                                <p className="text-xs text-red-600 mt-1">JSON inválido: {jsonError}</p>
                            )}
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1">
                                Template do título *
                            </label>
                            <Input
                                value={form.title_template}
                                onChange={(e) => setForm({ ...form, title_template: e.target.value })}
                                placeholder='Card "{titulo}" precisa de ajuste'
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Placeholders: <code>{`{titulo}`}</code>, <code>{`{stage_name}`}</code>,{' '}
                                <code>{`{missing_fields}`}</code>
                            </p>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1">
                                Template do corpo
                            </label>
                            <Textarea
                                value={form.body_template}
                                onChange={(e) => setForm({ ...form, body_template: e.target.value })}
                                rows={2}
                                placeholder="Campos pendentes: {missing_fields}"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="send_email"
                                checked={form.send_email}
                                onChange={(e) => setForm({ ...form, send_email: e.target.checked })}
                            />
                            <label htmlFor="send_email" className="text-sm text-slate-700">
                                Também enviar por email (respeita preferências do usuário)
                            </label>
                        </div>

                        {preview && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-md p-3 text-sm">
                                <p className="font-medium text-indigo-900">
                                    {preview.would_alert} de {preview.scope_total} cards
                                    {preview.capped && ' (limitado a 2000)'} disparariam este alerta
                                </p>
                                {preview.sample.length > 0 && (
                                    <ul className="mt-2 space-y-1 text-xs text-indigo-700">
                                        {preview.sample.slice(0, 5).map((c) => (
                                            <li key={c.id}>
                                                • {c.titulo}
                                                {!c.has_owner && (
                                                    <span className="text-amber-600 ml-1">
                                                        (sem dono — não recebe)
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                        {preview.sample.length > 5 && (
                                            <li className="text-indigo-500">
                                                … e mais {preview.would_alert - 5}
                                            </li>
                                        )}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={handlePreview}
                            disabled={previewLoading}
                        >
                            {previewLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <Eye className="w-4 h-4 mr-2" />
                            )}
                            Prever impacto
                        </Button>
                        <Button onClick={handleSave} disabled={isMutating}>
                            {isMutating ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : null}
                            {editingRule ? 'Salvar' : 'Criar regra'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Confirmação de delete */}
            <AlertDialog
                open={!!deleteCandidate}
                onOpenChange={(open) => !open && setDeleteCandidate(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir regra</AlertDialogTitle>
                        <AlertDialogDescription>
                            A regra "{deleteCandidate?.name}" será excluída permanentemente. As
                            notificações já enviadas permanecem no histórico dos usuários.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

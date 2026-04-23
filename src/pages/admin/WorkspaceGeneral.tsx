import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import { Settings, Loader2, Save, Building2, Palette, Clock, Download, ShieldCheck, LogOut, AlertTriangle, Workflow } from 'lucide-react'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useOrg } from '../../contexts/OrgContext'
import { useAuth } from '../../contexts/AuthContext'

interface WorkspaceFormState {
    name: string
    logo_url: string
    primary_color: string
    accent_color: string
    default_currency: string
    timezone: string
    date_format: string
    sub_card_requires_pos_venda: boolean
}

const CURRENCY_OPTIONS = [
    { value: 'BRL', label: 'Real (BRL)' },
    { value: 'USD', label: 'Dólar (USD)' },
    { value: 'EUR', label: 'Euro (EUR)' },
]

const TIMEZONE_OPTIONS = [
    { value: 'America/Sao_Paulo', label: 'São Paulo (GMT-3)' },
    { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
    { value: 'America/Noronha', label: 'Fernando de Noronha (GMT-2)' },
    { value: 'America/New_York', label: 'New York (GMT-5)' },
    { value: 'Europe/Lisbon', label: 'Lisboa (GMT)' },
]

const DATE_FORMAT_OPTIONS = [
    { value: 'dd/MM/yyyy', label: '31/12/2026 (BR)' },
    { value: 'MM/dd/yyyy', label: '12/31/2026 (US)' },
    { value: 'yyyy-MM-dd', label: '2026-12-31 (ISO)' },
]

export default function WorkspaceGeneral() {
    const { org, isLoading } = useOrg()
    const { profile } = useAuth()
    const queryClient = useQueryClient()

    const [form, setForm] = useState<WorkspaceFormState>({
        name: '',
        logo_url: '',
        primary_color: '#4f46e5',
        accent_color: '#0d9488',
        default_currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        date_format: 'dd/MM/yyyy',
        sub_card_requires_pos_venda: true,
    })

    // Sincronizar form com dados do banco quando carregar
    useEffect(() => {
        if (org) {
            setForm({
                name: org.name,
                logo_url: org.logo_url ?? '',
                primary_color: org.branding?.primary_color ?? '#4f46e5',
                accent_color: org.branding?.accent_color ?? '#0d9488',
                default_currency: org.settings?.default_currency ?? 'BRL',
                timezone: org.settings?.timezone ?? 'America/Sao_Paulo',
                date_format: org.settings?.date_format ?? 'dd/MM/yyyy',
                sub_card_requires_pos_venda: org.settings?.sub_card_requires_pos_venda !== false,
            })
        }
    }, [org])

    const saveMutation = useMutation({
        mutationFn: async (data: WorkspaceFormState) => {
            if (!org) throw new Error('Organização não carregada')
            const payload = {
                name: data.name.trim(),
                logo_url: data.logo_url.trim() || null,
                branding: {
                    primary_color: data.primary_color,
                    accent_color: data.accent_color,
                },
                settings: {
                    ...(org.settings ?? {}),
                    default_currency: data.default_currency,
                    timezone: data.timezone,
                    date_format: data.date_format,
                    sub_card_requires_pos_venda: data.sub_card_requires_pos_venda,
                },
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('organizations').update(payload).eq('id', org.id)
            if (error) throw error
        },
        onSuccess: () => {
            toast.success('Configurações salvas!')
            queryClient.invalidateQueries({ queryKey: ['organization'] })
        },
        onError: (err: Error) => toast.error(`Erro: ${err.message}`),
    })

    const isAdmin = profile?.is_admin === true

    const [forcingRelogin, setForcingRelogin] = useState(false)
    const [showReloginConfirm, setShowReloginConfirm] = useState(false)

    const handleForceRelogin = async () => {
        if (!org) return
        setForcingRelogin(true)
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
                .from('organizations')
                .update({ force_relogin_after: new Date().toISOString() })
                .eq('id', org.id)
            if (error) throw error
            toast.success('Re-login forçado! Todos os usuários serão deslogados na próxima ação.')
            queryClient.invalidateQueries({ queryKey: ['organization'] })
            setShowReloginConfirm(false)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Erro ao forçar re-login'
            toast.error(`Erro: ${message}`)
        } finally {
            setForcingRelogin(false)
        }
    }

    const [exporting, setExporting] = useState(false)
    const handleExport = async () => {
        setExporting(true)
        try {
            const { data, error } = await supabase.functions.invoke('export-org-data', {
                method: 'POST',
            })
            if (error) throw error

            // data é JSON — fazer download
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `welcomecrm-export-${org?.slug ?? 'org'}-${new Date().toISOString().split('T')[0]}.json`
            a.click()
            URL.revokeObjectURL(url)
            toast.success('Dados exportados com sucesso!')
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Erro ao exportar'
            toast.error(`Erro: ${message}`)
        } finally {
            setExporting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        )
    }

    if (!org) {
        return (
            <div className="p-6 text-center text-slate-400">Organização não encontrada</div>
        )
    }

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <AdminPageHeader
                title="Configurações Gerais"
                subtitle="Identidade visual, preferências regionais e branding da sua organização"
                icon={<Settings className="w-5 h-5" />}
            />

            {!isAdmin && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 mb-6 text-sm">
                    Apenas administradores podem editar estas configurações.
                </div>
            )}

            <div className="space-y-6">
                {/* Identidade */}
                <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Building2 className="w-4 h-4 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-900">Identidade</h2>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                Nome da empresa
                            </label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                disabled={!isAdmin}
                                placeholder="Welcome Group"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                URL do logo
                            </label>
                            <Input
                                type="url"
                                value={form.logo_url}
                                onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                                disabled={!isAdmin}
                                placeholder="https://seu-dominio.com/logo.png"
                            />
                            <p className="text-xs text-slate-400 mt-1">
                                Link direto para imagem PNG/SVG (recomendado: 200x60px, fundo transparente)
                            </p>
                            {form.logo_url && (
                                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg inline-block">
                                    <img
                                        src={form.logo_url}
                                        alt="Preview do logo"
                                        className="h-10 w-auto"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                            Slug: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{org.slug}</code>
                            <span className="ml-2 text-slate-400">(não pode ser alterado)</span>
                        </div>
                    </div>
                </section>

                {/* Cores */}
                <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Palette className="w-4 h-4 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-900">Cores da marca</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                Cor primária
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={form.primary_color}
                                    onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
                                    disabled={!isAdmin}
                                    className="h-10 w-14 border border-slate-200 rounded-md cursor-pointer disabled:opacity-50"
                                />
                                <Input
                                    value={form.primary_color}
                                    onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
                                    disabled={!isAdmin}
                                    className="font-mono text-sm"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                Cor de destaque
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={form.accent_color}
                                    onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))}
                                    disabled={!isAdmin}
                                    className="h-10 w-14 border border-slate-200 rounded-md cursor-pointer disabled:opacity-50"
                                />
                                <Input
                                    value={form.accent_color}
                                    onChange={(e) => setForm((f) => ({ ...f, accent_color: e.target.value }))}
                                    disabled={!isAdmin}
                                    className="font-mono text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Regional */}
                <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Clock className="w-4 h-4 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-900">Preferências regionais</h2>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                Moeda padrão
                            </label>
                            <select
                                value={form.default_currency}
                                onChange={(e) => setForm((f) => ({ ...f, default_currency: e.target.value }))}
                                disabled={!isAdmin}
                                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-900 disabled:opacity-50 disabled:bg-slate-50"
                            >
                                {CURRENCY_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                Fuso horário
                            </label>
                            <select
                                value={form.timezone}
                                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                                disabled={!isAdmin}
                                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-900 disabled:opacity-50 disabled:bg-slate-50"
                            >
                                {TIMEZONE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                Formato de data
                            </label>
                            <select
                                value={form.date_format}
                                onChange={(e) => setForm((f) => ({ ...f, date_format: e.target.value }))}
                                disabled={!isAdmin}
                                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-900 disabled:opacity-50 disabled:bg-slate-50"
                            >
                                {DATE_FORMAT_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                {/* Regras do funil */}
                <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Workflow className="w-4 h-4 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-900">Regras do funil</h2>
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={form.sub_card_requires_pos_venda}
                            onChange={(e) => setForm((f) => ({ ...f, sub_card_requires_pos_venda: e.target.checked }))}
                            disabled={!isAdmin}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                        />
                        <span>
                            <span className="block text-sm font-medium text-slate-900">
                                Só permitir sub-card quando o card principal estiver em Pós-venda
                            </span>
                            <span className="block text-xs text-slate-500 mt-0.5">
                                Evita que sub-cards (mudanças e vendas extras) sejam criados em etapas comerciais por engano.
                                Vale para a interface e para integrações (n8n, importações). Recomendado ligado.
                            </span>
                        </span>
                    </label>
                </section>

                {/* Gestão de Sessões */}
                {isAdmin && (
                    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <LogOut className="w-4 h-4 text-slate-500" />
                            <h2 className="text-sm font-semibold text-slate-900">Gestão de Sessões</h2>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <p className="text-sm text-slate-700 mb-1 font-medium">Forçar re-login de todos os usuários</p>
                                <p className="text-xs text-slate-500 mb-3">
                                    Todos os usuários da organização serão deslogados e precisarão fazer login novamente.
                                    Útil após alterações de permissões, mudanças em equipes ou atualizações importantes.
                                </p>

                                {org.force_relogin_after && (
                                    <p className="text-xs text-slate-400 mb-3">
                                        Último re-login forçado: {new Date(org.force_relogin_after).toLocaleString('pt-BR')}
                                    </p>
                                )}

                                {!showReloginConfirm ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowReloginConfirm(true)}
                                    >
                                        <LogOut className="w-4 h-4 mr-2" />
                                        Forçar re-login
                                    </Button>
                                ) : (
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                        <div className="flex items-start gap-2 mb-3">
                                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                            <p className="text-sm text-amber-800">
                                                Tem certeza? Todos os usuários (incluindo você) serão deslogados ao acessar o CRM.
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={handleForceRelogin}
                                                disabled={forcingRelogin}
                                            >
                                                {forcingRelogin ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                        Processando...
                                                    </>
                                                ) : (
                                                    'Confirmar re-login'
                                                )}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setShowReloginConfirm(false)}
                                                disabled={forcingRelogin}
                                            >
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {/* LGPD & Privacidade */}
                {isAdmin && (
                    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <ShieldCheck className="w-4 h-4 text-slate-500" />
                            <h2 className="text-sm font-semibold text-slate-900">Privacidade e LGPD</h2>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <p className="text-sm text-slate-700 mb-1 font-medium">Exportar dados da organização</p>
                                <p className="text-xs text-slate-500 mb-3">
                                    Gera um arquivo JSON com todos os dados tratados pelo WelcomeCRM para sua organização,
                                    conforme Art. 18 da LGPD. Tokens de integração são redactados por segurança.
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExport}
                                    disabled={exporting}
                                >
                                    {exporting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Exportando...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4 mr-2" />
                                            Exportar dados (LGPD)
                                        </>
                                    )}
                                </Button>
                            </div>

                            <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                                <p>
                                    <a href="/legal/terms" target="_blank" className="text-indigo-600 hover:text-indigo-700 underline">
                                        Termos de Uso
                                    </a>
                                    {' · '}
                                    <a href="/legal/privacy" target="_blank" className="text-indigo-600 hover:text-indigo-700 underline">
                                        Política de Privacidade
                                    </a>
                                    {' · '}
                                    <a href="/legal/dpa" target="_blank" className="text-indigo-600 hover:text-indigo-700 underline">
                                        DPA
                                    </a>
                                </p>
                            </div>
                        </div>
                    </section>
                )}

                {/* Save button */}
                {isAdmin && (
                    <div className="flex justify-end pt-2">
                        <Button
                            onClick={() => saveMutation.mutate(form)}
                            disabled={saveMutation.isPending || !form.name.trim()}
                        >
                            {saveMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    Salvar configurações
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}

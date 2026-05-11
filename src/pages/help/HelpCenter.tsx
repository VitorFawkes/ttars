import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
    BookOpen,
    Search,
    ArrowRight,
    ArrowLeft,
    Rocket,
    Kanban,
    Users,
    Settings,
    Plug,
    ShieldCheck,
    Mail,
    Zap,
    FileText,
} from 'lucide-react'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Input } from '../../components/ui/Input'
import { HELP_ARTICLES, type HelpArticle } from './helpArticles'

const CATEGORY_ICONS: Record<string, typeof Rocket> = {
    'getting-started': Rocket,
    pipeline: Kanban,
    users: Users,
    workspace: Settings,
    integrations: Plug,
    security: ShieldCheck,
    notifications: Mail,
    automation: Zap,
    'field-config': FileText,
}

const CATEGORIES = [
    { key: 'getting-started', label: 'Primeiros passos', description: 'Começando com o WelcomeCRM' },
    { key: 'pipeline', label: 'Pipeline e cards', description: 'Gestão do funil de vendas' },
    { key: 'field-config', label: 'Campos e seções', description: 'Customizar o formulário do card' },
    { key: 'users', label: 'Usuários e times', description: 'Convites, roles, departamentos' },
    { key: 'workspace', label: 'Configuração da empresa', description: 'Identidade, branding, regional' },
    { key: 'automation', label: 'Automações e cadências', description: 'Tarefas automáticas, sequências' },
    { key: 'integrations', label: 'Integrações', description: 'ActiveCampaign, WhatsApp, API' },
    { key: 'notifications', label: 'Notificações', description: 'Email, push, in-app' },
    { key: 'security', label: 'Segurança e LGPD', description: 'Permissões, export de dados, DPA' },
]

export default function HelpCenter() {
    const [search, setSearch] = useState('')
    const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null)

    const filteredArticles = useMemo(() => {
        if (!search.trim()) return null
        const q = search.toLowerCase()
        return HELP_ARTICLES.filter(
            (a) =>
                a.title.toLowerCase().includes(q) ||
                a.summary.toLowerCase().includes(q) ||
                a.searchText.toLowerCase().includes(q)
        )
    }, [search])

    // Artigo aberto
    if (selectedArticle) {
        const CategoryIcon = CATEGORY_ICONS[selectedArticle.category] ?? BookOpen
        const Content = selectedArticle.Content
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <button
                    onClick={() => setSelectedArticle(null)}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar ao Help Center
                </button>

                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
                    <div className="flex items-center gap-2 mb-2">
                        <CategoryIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                            {CATEGORIES.find((c) => c.key === selectedArticle.category)?.label}
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">{selectedArticle.title}</h1>
                    <p className="text-sm text-slate-500 mb-6">{selectedArticle.summary}</p>

                    <div className="prose prose-sm prose-slate max-w-none">
                        <Content />
                    </div>

                    {selectedArticle.related && selectedArticle.related.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-slate-200">
                            <h3 className="text-sm font-semibold text-slate-900 mb-3">Artigos relacionados</h3>
                            <ul className="space-y-1.5">
                                {selectedArticle.related.map((relId) => {
                                    const related = HELP_ARTICLES.find((a) => a.id === relId)
                                    if (!related) return null
                                    return (
                                        <li key={relId}>
                                            <button
                                                onClick={() => setSelectedArticle(related)}
                                                className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5"
                                            >
                                                <ArrowRight className="w-3 h-3" />
                                                {related.title}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <AdminPageHeader
                title="Central de Ajuda"
                subtitle="Guias, tutoriais e documentação do WelcomeCRM"
                icon={<BookOpen className="w-5 h-5" />}
            />

            {/* Search */}
            <div className="mb-6">
                <div className="relative max-w-xl">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar artigos..."
                        className="pl-9"
                    />
                </div>
            </div>

            {/* Resultados da busca */}
            {filteredArticles !== null ? (
                <div>
                    <p className="text-sm text-slate-500 mb-3">
                        {filteredArticles.length === 0
                            ? 'Nenhum artigo encontrado'
                            : `${filteredArticles.length} artigos encontrados`}
                    </p>
                    <div className="space-y-2">
                        {filteredArticles.map((article) => (
                            <button
                                key={article.id}
                                onClick={() => setSelectedArticle(article)}
                                className="block w-full text-left p-4 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all"
                            >
                                <h3 className="font-semibold text-sm text-slate-900">{article.title}</h3>
                                <p className="text-xs text-slate-500 mt-1">{article.summary}</p>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                /* Categorias */
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {CATEGORIES.map((cat) => {
                        const Icon = CATEGORY_ICONS[cat.key] ?? BookOpen
                        const articles = HELP_ARTICLES.filter((a) => a.category === cat.key)
                        return (
                            <div
                                key={cat.key}
                                className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 hover:border-slate-300 transition-colors"
                            >
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-sm text-slate-900">{cat.label}</h3>
                                        <p className="text-xs text-slate-500">{cat.description}</p>
                                    </div>
                                </div>

                                {articles.length > 0 ? (
                                    <ul className="space-y-1.5">
                                        {articles.slice(0, 5).map((a) => (
                                            <li key={a.id}>
                                                <button
                                                    onClick={() => setSelectedArticle(a)}
                                                    className="text-xs text-slate-600 hover:text-indigo-600 text-left"
                                                >
                                                    {a.title}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-slate-400 italic">Nenhum artigo ainda</p>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Links legais */}
            <div className="mt-12 pt-6 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-400 mb-2">Documentos legais</p>
                <div className="flex items-center justify-center gap-4 text-xs">
                    <Link to="/legal/terms" className="text-indigo-600 hover:text-indigo-700 underline">
                        Termos de Uso
                    </Link>
                    <Link to="/legal/privacy" className="text-indigo-600 hover:text-indigo-700 underline">
                        Política de Privacidade
                    </Link>
                    <Link to="/legal/dpa" className="text-indigo-600 hover:text-indigo-700 underline">
                        DPA
                    </Link>
                </div>
            </div>
        </div>
    )
}

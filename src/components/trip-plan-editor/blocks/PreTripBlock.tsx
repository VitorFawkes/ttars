/**
 * PreTripBlock — Seção pré-viagem com tópicos toggle + tópicos custom.
 *
 * Tópicos sugeridos como base, operador pode adicionar/remover livremente.
 * Sem emojis — ícones Lucide consistentes.
 */

import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { createElement } from 'react'
import {
    BookOpen,
    ClipboardCheck,
    Syringe,
    ShieldCheck,
    Coins,
    Clock,
    Luggage,
    Sun,
    Train,
    AlertTriangle,
    Plus,
    X,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ElementType> = {
    passport: BookOpen,
    visa: ClipboardCheck,
    vaccines: Syringe,
    insurance: ShieldCheck,
    currency: Coins,
    timezone: Clock,
    luggage: Luggage,
    weather: Sun,
    transport: Train,
    emergency: AlertTriangle,
}

const PRE_TRIP_TOPICS: Array<{ key: string; label: string; defaultNote: string }> = [
    { key: 'passport', label: 'Passaporte', defaultNote: 'Verifique se seu passaporte tem pelo menos 6 meses de validade.' },
    { key: 'visa', label: 'Vistos', defaultNote: 'Verifique se o destino exige visto para brasileiros.' },
    { key: 'vaccines', label: 'Vacinas', defaultNote: 'Consulte a ANVISA para vacinas obrigatórias e recomendadas.' },
    { key: 'insurance', label: 'Seguro Viagem', defaultNote: 'Seu seguro viagem está incluído na proposta.' },
    { key: 'currency', label: 'Câmbio e Moeda', defaultNote: '' },
    { key: 'timezone', label: 'Fuso Horário', defaultNote: '' },
    { key: 'luggage', label: 'Bagagem', defaultNote: 'Confira a franquia de bagagem do seu voo.' },
    { key: 'weather', label: 'Clima', defaultNote: '' },
    { key: 'transport', label: 'Transporte Local', defaultNote: '' },
    { key: 'emergency', label: 'Emergências', defaultNote: '' },
]

// Templates por destino
const DESTINATION_TEMPLATES: Record<string, { label: string; topics: string[]; notes: Record<string, string> }> = {
    europa: {
        label: 'Europa',
        topics: ['passport', 'visa', 'currency', 'timezone', 'transport', 'weather', 'luggage'],
        notes: {
            visa: 'Brasileiros não precisam de visto para estadias de até 90 dias no Espaço Schengen.',
            currency: 'Euro (EUR) na maioria dos países. Cartão internacional funciona em quase todo lugar.',
            transport: 'Trens de alta velocidade conectam as principais cidades. Compre passes com antecedência.',
        },
    },
    caribe: {
        label: 'Caribe',
        topics: ['passport', 'vaccines', 'insurance', 'currency', 'weather', 'luggage'],
        notes: {
            vaccines: 'Febre amarela pode ser exigida. Consulte a ANVISA.',
            weather: 'Clima tropical. Temporada de furacões: jun-nov. Protetor solar é essencial.',
            currency: 'Varia por país. Dólar americano aceito na maioria dos destinos.',
        },
    },
    disney: {
        label: 'Disney / Orlando',
        topics: ['passport', 'visa', 'insurance', 'currency', 'timezone', 'luggage'],
        notes: {
            visa: 'Visto americano (B1/B2) obrigatório. Agende entrevista com antecedência.',
            currency: 'Dólar americano (USD). Cartões aceitos em todos os parques.',
            timezone: 'Orlando está no fuso EST (UTC-5). 2h a menos que Brasília no horário de verão.',
        },
    },
    asia: {
        label: 'Ásia',
        topics: ['passport', 'visa', 'vaccines', 'insurance', 'currency', 'timezone', 'transport', 'weather'],
        notes: {
            visa: 'Cada país tem regras diferentes. Tailândia: isento 90 dias. Japão: isento 90 dias. China: visto obrigatório.',
            vaccines: 'Febre amarela e hepatite A recomendadas. Consulte a ANVISA.',
            timezone: 'Grande diferença de fuso (9-12h). Planeje dias de adaptação.',
        },
    },
}

interface PreTripBlockProps {
    data: Record<string, unknown>
    onChange: (data: Record<string, unknown>) => void
}

export function PreTripBlock({ data, onChange }: PreTripBlockProps) {
    const topics: string[] = Array.isArray(data.topics) ? (data.topics as string[]) : []
    const customNotes: Record<string, string> = (data.custom_notes as Record<string, string>) || {}
    const customTopics: Array<{ key: string; label: string }> = Array.isArray(data.custom_topics)
        ? (data.custom_topics as Array<{ key: string; label: string }>)
        : []

    const [newTopicLabel, setNewTopicLabel] = useState('')

    const toggleTopic = (key: string) => {
        const newTopics = topics.includes(key)
            ? topics.filter(t => t !== key)
            : [...topics, key]
        onChange({ ...data, topics: newTopics })
    }

    const updateNote = (key: string, value: string) => {
        onChange({ ...data, custom_notes: { ...customNotes, [key]: value } })
    }

    const addCustomTopic = () => {
        if (!newTopicLabel.trim()) return
        const key = `custom_${crypto.randomUUID().slice(0, 8)}`
        const newCustom = [...customTopics, { key, label: newTopicLabel.trim() }]
        onChange({ ...data, custom_topics: newCustom, topics: [...topics, key] })
        setNewTopicLabel('')
    }

    const removeCustomTopic = (key: string) => {
        onChange({
            ...data,
            custom_topics: customTopics.filter(t => t.key !== key),
            topics: topics.filter(t => t !== key),
        })
    }

    const loadTemplate = (templateKey: string) => {
        const template = DESTINATION_TEMPLATES[templateKey]
        if (!template) return
        onChange({
            ...data,
            topics: template.topics,
            custom_notes: { ...customNotes, ...template.notes },
        })
    }

    // Combinar tópicos padrão + custom
    const allTopics = [
        ...PRE_TRIP_TOPICS,
        ...customTopics.map(ct => ({ key: ct.key, label: ct.label, defaultNote: '' })),
    ]

    return (
        <div className="space-y-3">
            {/* Templates por destino */}
            <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1.5">
                    Carregar template
                </p>
                <div className="flex gap-1.5 flex-wrap">
                    {Object.entries(DESTINATION_TEMPLATES).map(([key, tmpl]) => (
                        <button
                            key={key}
                            onClick={() => loadTemplate(key)}
                            className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                        >
                            {tmpl.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tópicos */}
            <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-1.5">
                    Tópicos
                </p>
                {allTopics.map(topic => {
                    const isActive = topics.includes(topic.key)
                    const IconComponent = ICON_MAP[topic.key]
                    const isCustom = topic.key.startsWith('custom_')

                    return (
                        <div key={topic.key} className="mb-1.5">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => toggleTopic(topic.key)}
                                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                                        isActive
                                            ? 'bg-orange-50 border border-orange-200'
                                            : 'bg-slate-50 border border-transparent hover:border-slate-200'
                                    }`}
                                >
                                    {IconComponent && createElement(IconComponent, {
                                        className: `h-3.5 w-3.5 shrink-0 ${isActive ? 'text-orange-600' : 'text-slate-400'}`,
                                    })}
                                    {!IconComponent && (
                                        <div className={`w-3.5 h-3.5 rounded-full shrink-0 ${isActive ? 'bg-orange-400' : 'bg-slate-300'}`} />
                                    )}
                                    <span className={`text-xs font-medium ${isActive ? 'text-orange-700' : 'text-slate-500'}`}>
                                        {topic.label}
                                    </span>
                                </button>
                                {isCustom && (
                                    <button
                                        onClick={() => removeCustomTopic(topic.key)}
                                        className="p-1 text-slate-300 hover:text-red-500"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                            {isActive && (
                                <textarea
                                    value={customNotes[topic.key] ?? topic.defaultNote}
                                    onChange={(e) => updateNote(topic.key, e.target.value)}
                                    placeholder={`Nota sobre ${topic.label.toLowerCase()}...`}
                                    rows={2}
                                    className="w-full mt-1 ml-5 rounded-md border border-slate-200 px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-orange-400"
                                    style={{ width: 'calc(100% - 1.25rem)' }}
                                />
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Adicionar tópico custom */}
            <div className="flex items-center gap-2">
                <Input
                    value={newTopicLabel}
                    onChange={(e) => setNewTopicLabel(e.target.value)}
                    placeholder="Novo tópico personalizado"
                    className="h-7 text-xs flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomTopic()}
                />
                <button
                    onClick={addCustomTopic}
                    disabled={!newTopicLabel.trim()}
                    className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 disabled:opacity-40"
                >
                    <Plus className="h-3 w-3" />
                    Adicionar
                </button>
            </div>
        </div>
    )
}

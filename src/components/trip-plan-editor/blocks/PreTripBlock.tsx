/**
 * PreTripBlock — Seção pré-viagem com tópicos toggle.
 * Passaporte, vistos, moeda, fuso horário, seguro, bagagem, etc.
 */

const PRE_TRIP_TOPICS: Array<{ key: string; label: string; emoji: string; defaultNote: string }> = [
    { key: 'passport', label: 'Passaporte', emoji: '🛂', defaultNote: 'Verifique se seu passaporte tem pelo menos 6 meses de validade.' },
    { key: 'visa', label: 'Vistos', emoji: '📋', defaultNote: 'Verifique se o destino exige visto para brasileiros.' },
    { key: 'vaccines', label: 'Vacinas', emoji: '💉', defaultNote: 'Consulte a ANVISA para vacinas obrigatórias e recomendadas.' },
    { key: 'insurance', label: 'Seguro Viagem', emoji: '🛡️', defaultNote: 'Seu seguro viagem está incluído na proposta.' },
    { key: 'currency', label: 'Câmbio e Moeda', emoji: '💰', defaultNote: '' },
    { key: 'timezone', label: 'Fuso Horário', emoji: '🕐', defaultNote: '' },
    { key: 'luggage', label: 'Bagagem', emoji: '🧳', defaultNote: 'Confira a franquia de bagagem do seu voo.' },
    { key: 'weather', label: 'Clima', emoji: '☀️', defaultNote: '' },
    { key: 'transport', label: 'Transporte Local', emoji: '🚇', defaultNote: '' },
    { key: 'emergency', label: 'Emergências', emoji: '🚨', defaultNote: '' },
]

interface PreTripBlockProps {
    data: Record<string, unknown>
    onChange: (data: Record<string, unknown>) => void
}

export function PreTripBlock({ data, onChange }: PreTripBlockProps) {
    const topics: string[] = Array.isArray(data.topics) ? (data.topics as string[]) : []
    const customNotes: Record<string, string> = (data.custom_notes as Record<string, string>) || {}

    const toggleTopic = (key: string) => {
        const newTopics = topics.includes(key)
            ? topics.filter(t => t !== key)
            : [...topics, key]
        onChange({ ...data, topics: newTopics })
    }

    const updateNote = (key: string, value: string) => {
        onChange({ ...data, custom_notes: { ...customNotes, [key]: value } })
    }

    return (
        <div className="space-y-2">
            <p className="text-xs text-slate-500 mb-2">
                Selecione os tópicos que serão exibidos ao cliente antes da viagem:
            </p>
            {PRE_TRIP_TOPICS.map(topic => {
                const isActive = topics.includes(topic.key)
                return (
                    <div key={topic.key} className="space-y-1">
                        <button
                            onClick={() => toggleTopic(topic.key)}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                                isActive
                                    ? 'bg-orange-50 border border-orange-200'
                                    : 'bg-slate-50 border border-transparent hover:border-slate-200'
                            }`}
                        >
                            <span className="text-sm">{topic.emoji}</span>
                            <span className={`text-xs font-medium ${isActive ? 'text-orange-700' : 'text-slate-500'}`}>
                                {topic.label}
                            </span>
                        </button>
                        {isActive && (
                            <textarea
                                value={customNotes[topic.key] || topic.defaultNote}
                                onChange={(e) => updateNote(topic.key, e.target.value)}
                                placeholder={`Nota sobre ${topic.label.toLowerCase()}...`}
                                rows={2}
                                className="w-full ml-6 rounded-md border border-slate-200 px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-orange-400"
                                style={{ width: 'calc(100% - 1.5rem)' }}
                            />
                        )}
                    </div>
                )
            })}
        </div>
    )
}

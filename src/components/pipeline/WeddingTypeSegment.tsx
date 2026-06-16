// Segmento DW × Elop visível na barra do Kanban de Weddings.
// Corte de TIPO de casamento (não confundir com nº de convidados / "Apenas o casal").
// Token canônico igual ao Analytics/backend: 'DW' / 'Elopement'. selected = [] → "Ambos" (todos).
// Renderizado APENAS quando o produto ativo é WEDDING (tema .theme-ww sempre ativo aqui),
// por isso usa os tokens ww-* diretamente, como o TipoSegment do Analytics.

type Tipo = 'todos' | 'DW' | 'Elopement'

const OPTIONS: { k: Tipo; label: string }[] = [
    { k: 'DW', label: 'DW' },
    { k: 'Elopement', label: 'Elopement' },
    { k: 'todos', label: 'Ambos' },
]

interface Props {
    selected: string[]
    onChange: (next: string[]) => void
}

export function WeddingTypeSegment({ selected, onChange }: Props) {
    const current: Tipo =
        selected.includes('Elopement') && !selected.includes('DW') ? 'Elopement'
        : selected.includes('DW') && !selected.includes('Elopement') ? 'DW'
        : 'todos'

    const set = (k: Tipo) => onChange(k === 'todos' ? [] : [k])

    return (
        <div className="inline-flex items-center gap-1.5">
            <span className="text-xs font-medium text-ww-n500 px-1 select-none">💍 Tipo</span>
            <div className="inline-flex items-center gap-0.5 bg-ww-cream rounded-lg p-0.5">
                {OPTIONS.map(o => (
                    <button
                        key={o.k}
                        type="button"
                        onClick={() => set(o.k)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold ${
                            current === o.k
                                ? 'bg-ww-gold text-white shadow-sm'
                                : 'text-ww-n600 hover:text-ww-n700'
                        }`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    )
}

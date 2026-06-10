import { useState } from 'react'
import { Search, Tag, Upload, Download, Plus, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { TIPOS, type LadoKey, type LadoLabels, type TipoKey } from '../../../lib/convidados/types'
import { ImportarModal } from './ImportarModal'

interface Props {
  search: string
  setSearch: (s: string) => void
  filterLado: LadoKey | ''
  setFilterLado: (l: LadoKey | '') => void
  filterTipo: TipoKey | ''
  setFilterTipo: (t: TipoKey | '') => void
  ladoLabels: LadoLabels
  onAddConvite: () => void
  onImport: (csvText: string) => void
  onExport: () => void
}

export function PlanilhaToolbar({
  search, setSearch, filterLado, setFilterLado, filterTipo, setFilterTipo, ladoLabels,
  onAddConvite, onImport, onExport,
}: Props) {
  const [importOpen, setImportOpen] = useState(false)

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap py-2">
      <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ww-n400" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar convite, pessoa ou telefone…"
            className="w-full pl-8 pr-7 h-8 text-[12.5px] border border-ww-sand-dk rounded-full focus:outline-none focus:ring-2 focus:ring-ww-gold/30 focus:border-ww-gold bg-white" />
          {search && (
            <button type="button" onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ww-n400 hover:text-ww-n700" aria-label="Limpar busca">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="inline-flex items-center gap-1 px-2 h-8 border border-ww-sand-dk bg-white rounded-md">
          <Tag className="w-3 h-3 text-ww-n400" />
          <select value={filterLado} onChange={(e) => setFilterLado(e.target.value as LadoKey | '')}
            className="text-[12px] bg-transparent focus:outline-none cursor-pointer text-ww-n600">
            <option value="">Qualquer lado</option>
            <option value="ambos">Ambos</option>
            <option value="noiva">{ladoLabels.noiva}</option>
            <option value="noivo">{ladoLabels.noivo}</option>
          </select>
        </div>
        <div className="inline-flex items-center gap-1 px-2 h-8 border border-ww-sand-dk bg-white rounded-md">
          <Tag className="w-3 h-3 text-ww-n400" />
          <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value as TipoKey | '')}
            className="text-[12px] bg-transparent focus:outline-none cursor-pointer text-ww-n600">
            <option value="">Qualquer tipo</option>
            {TIPOS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <button type="button" onClick={() => setImportOpen(true)} className={btnGhost} title="Importar lista de uma planilha">
          <Upload className="w-3 h-3" /> Importar
        </button>
        <button type="button" onClick={onExport} className={btnGhost} title="Exportar lista atual em CSV">
          <Download className="w-3 h-3" /> Exportar
        </button>
        <button type="button" onClick={onAddConvite}
          className="inline-flex items-center gap-1 px-2.5 h-8 text-xs font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors">
          <Plus className="w-3.5 h-3.5" /> Novo convite
        </button>
      </div>

      <ImportarModal open={importOpen} onClose={() => setImportOpen(false)} onImport={onImport} />
    </div>
  )
}

const btnGhost = cn('inline-flex items-center gap-1 px-2 h-8 text-[12px] font-medium rounded-md border border-ww-sand-dk bg-white text-ww-n600 hover:bg-ww-cream transition-colors')

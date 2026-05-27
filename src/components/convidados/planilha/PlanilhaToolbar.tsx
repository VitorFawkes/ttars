import { useRef } from 'react'
import { Search, Tag, Upload, Download, Plus, X, FileText } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { LADOS, TIPOS, type LadoKey, type TipoKey } from '../../../lib/convidados/types'
import { downloadCSV } from '../../../lib/convidados/csvConvites'
import { modeloCSVContent } from '../../../lib/convidados/csvModelo'

interface Props {
  search: string
  setSearch: (s: string) => void
  filterLado: LadoKey | ''
  setFilterLado: (l: LadoKey | '') => void
  filterTipo: TipoKey | ''
  setFilterTipo: (t: TipoKey | '') => void
  onAddConvite: () => void
  onImport: (csvText: string) => void
  onExport: () => void
}

export function PlanilhaToolbar({
  search, setSearch, filterLado, setFilterLado, filterTipo, setFilterTipo,
  onAddConvite, onImport, onExport,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleBaixarModelo = () => {
    downloadCSV('modelo-lista-convidados.csv', modeloCSVContent())
  }

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ww-n400" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar convite, pessoa ou telefone…"
            className="w-72 pl-8 pr-7 h-8 text-[12.5px] border border-ww-sand-dk rounded-full focus:outline-none focus:ring-2 focus:ring-ww-gold/30 focus:border-ww-gold bg-white" />
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
            {LADOS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
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

      <div className="flex items-center gap-1">
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return
            const text = await f.text(); onImport(text); e.target.value = ''
          }} />
        <button type="button" onClick={handleBaixarModelo} className={btnGhost} title="Baixar planilha modelo">
          <FileText className="w-3 h-3" /> Modelo
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={btnGhost} title="Importar CSV">
          <Upload className="w-3 h-3" /> Importar
        </button>
        <button type="button" onClick={onExport} className={btnGhost} title="Exportar CSV">
          <Download className="w-3 h-3" /> Exportar
        </button>
        <button type="button" onClick={onAddConvite}
          className="inline-flex items-center gap-1 px-2.5 h-8 text-xs font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors">
          <Plus className="w-3.5 h-3.5" /> Novo convite
        </button>
      </div>
    </div>
  )
}

const btnGhost = cn('inline-flex items-center gap-1 px-2 h-8 text-[12px] font-medium rounded-md border border-ww-sand-dk bg-white text-ww-n600 hover:bg-ww-cream transition-colors')

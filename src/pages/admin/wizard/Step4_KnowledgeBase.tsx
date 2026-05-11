import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { BookOpen, ClipboardPaste, Search, Plus, SkipForward, FileUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KBItemEditor } from '@/components/ai-agent/KBItemEditor'
import type { KbItem, useAgentWizard } from '@/hooks/useAgentWizard'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }
type ImportTab = 'paste' | 'manual' | 'csv'

function parseFAQText(text: string): KbItem[] {
  if (!text.trim()) return []
  return text.split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').filter((line) => line.trim())
      const titulo = lines[0]?.trim() || ''
      const conteudo = lines.slice(1).join('\n').trim()
      return { titulo, conteudo, tags: [] }
    })
    .filter((item) => item.titulo && item.conteudo)
}

function parseCSV(text: string): KbItem[] {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []
  // Simple CSV: assumes 2 columns (titulo, conteudo) with quote support
  const items: KbItem[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    // Basic CSV split respecting double quotes
    const match = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)
    if (!match || match.length < 2) continue
    const [rawTitulo, rawConteudo] = match.slice(0, 2).map((v) => {
      const cleaned = v.replace(/^,/, '').trim()
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        return cleaned.slice(1, -1).replace(/""/g, '"')
      }
      return cleaned
    })
    if (rawTitulo && rawConteudo) {
      items.push({ titulo: rawTitulo, conteudo: rawConteudo, tags: [] })
    }
  }
  return items
}

export default function Step4_KnowledgeBase({ wizard }: WizardProps) {
  const kb_items = (wizard.wizardData.step4?.kb_items || []) as KbItem[]

  const [activeTab, setActiveTab] = useState<ImportTab>('paste')
  const [pasteText, setPasteText] = useState('')
  const [csvText, setCsvText] = useState('')
  const [manualTitulo, setManualTitulo] = useState('')
  const [manualConteudo, setManualConteudo] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const updateItems = (next: KbItem[]) => wizard.updateStep('step4', { kb_items: next })

  const handlePasteImport = () => {
    const parsed = parseFAQText(pasteText)
    if (parsed.length === 0) return
    updateItems([...kb_items, ...parsed])
    setPasteText('')
  }

  const handleCSVImport = () => {
    const parsed = parseCSV(csvText)
    if (parsed.length === 0) return
    updateItems([...kb_items, ...parsed])
    setCsvText('')
  }

  const handleManualAdd = () => {
    if (!manualTitulo.trim() || !manualConteudo.trim()) return
    updateItems([...kb_items, { titulo: manualTitulo, conteudo: manualConteudo, tags: [] }])
    setManualTitulo('')
    setManualConteudo('')
  }

  const handleItemUpdate = (idx: number, updates: Partial<KbItem>) => {
    const next = [...kb_items]
    next[idx] = { ...next[idx], ...updates }
    updateItems(next)
  }

  const handleItemDelete = (idx: number) => {
    updateItems(kb_items.filter((_, i) => i !== idx))
  }

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsvText(text)
  }

  // Simple text search over titulo + conteudo
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return [] as { item: KbItem; score: number; idx: number }[]
    return kb_items
      .map((item, idx) => {
        const hay = `${item.titulo} ${item.conteudo}`.toLowerCase()
        let score = 0
        for (const token of q.split(/\s+/)) {
          if (!token) continue
          if (item.titulo.toLowerCase().includes(token)) score += 2
          if (item.conteudo.toLowerCase().includes(token)) score += 1
          if (hay.includes(token)) score += 0.5
        }
        return { item, score, idx }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [kb_items, searchQuery])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Base de conhecimento</h2>
        <p className="text-slate-500 mt-1 text-sm">
          Alimente o agente com FAQs, políticas e informações sobre produtos. Opcional — pule se seu template já for suficiente.
        </p>
      </div>

      {/* Import section */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50">
          {([
            { id: 'paste', icon: ClipboardPaste, label: 'Colar texto' },
            { id: 'csv', icon: FileUp, label: 'CSV' },
            { id: 'manual', icon: Plus, label: 'Adicionar manual' },
          ] as const).map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-700 bg-white'
                    : 'border-transparent text-slate-600 hover:bg-slate-100'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="p-5">
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Cole o FAQ. Separe cada item com uma linha em branco — a primeira linha vira o título, o resto é o conteúdo.
              </p>
              <Textarea
                placeholder={`Qual o prazo de resposta?\nRespondemos em até 4 horas nos dias úteis, e em até 24h nos fins de semana.\n\nVocês fazem pacotes internacionais?\nSim! Trabalhamos com Europa, Ásia, América do Sul e Caribe.`}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="min-h-[180px] font-mono text-xs"
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">
                  {parseFAQText(pasteText).length} item{parseFAQText(pasteText).length === 1 ? '' : 's'} detectado{parseFAQText(pasteText).length === 1 ? '' : 's'}
                </span>
                <Button onClick={handlePasteImport} disabled={parseFAQText(pasteText).length === 0} className="gap-2">
                  <Plus className="w-4 h-4" /> Importar
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'csv' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Envie um CSV com 2 colunas: <code className="bg-slate-100 px-1 rounded">titulo,conteudo</code>. A primeira linha é o cabeçalho.
              </p>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer text-sm">
                  <FileUp className="w-4 h-4" />
                  Escolher arquivo CSV
                  <input type="file" accept=".csv" onChange={handleCsvFile} className="hidden" />
                </label>
                <span className="text-xs text-slate-400">ou cole abaixo</span>
              </div>
              <Textarea
                placeholder="titulo,conteudo&#10;&quot;Prazo de resposta&quot;,&quot;Respondemos em até 4 horas&quot;"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="min-h-[140px] font-mono text-xs"
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">
                  {parseCSV(csvText).length} linha{parseCSV(csvText).length === 1 ? '' : 's'} detectada{parseCSV(csvText).length === 1 ? '' : 's'}
                </span>
                <Button onClick={handleCSVImport} disabled={parseCSV(csvText).length === 0} className="gap-2">
                  <Plus className="w-4 h-4" /> Importar
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Título</Label>
                <Input
                  value={manualTitulo}
                  onChange={(e) => setManualTitulo(e.target.value)}
                  placeholder="Ex: Qual a política de cancelamento?"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Conteúdo</Label>
                <Textarea
                  value={manualConteudo}
                  onChange={(e) => setManualConteudo(e.target.value)}
                  placeholder="Resposta completa..."
                  className="min-h-[120px]"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleManualAdd}
                  disabled={!manualTitulo.trim() || !manualConteudo.trim()}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" /> Adicionar item
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Items list */}
      {kb_items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              {kb_items.length} item{kb_items.length === 1 ? '' : 's'} na base
            </h3>
          </div>
          <div className="space-y-2">
            {kb_items.map((item, idx) => (
              <KBItemEditor
                key={idx}
                item={item}
                index={idx}
                onUpdate={(u) => handleItemUpdate(idx, u)}
                onDelete={() => handleItemDelete(idx)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Search test */}
      {kb_items.length >= 2 && (
        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-indigo-600" />
            <h3 className="font-semibold text-sm text-slate-900">Testar busca</h3>
          </div>
          <p className="text-xs text-slate-600 mb-3">
            Simule uma pergunta do cliente. O agente consultaria esses itens.
          </p>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ex: qual o prazo de resposta?"
            className="bg-white"
          />
          {searchQuery.trim() && (
            <div className="mt-3 space-y-1.5">
              {searchResults.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Nenhum item corresponde à busca.</p>
              ) : (
                searchResults.map((r) => (
                  <div key={r.idx} className="bg-white rounded-lg p-3 text-sm border border-slate-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900 truncate">{r.item.titulo}</p>
                        <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{r.item.conteudo}</p>
                      </div>
                      <span className="text-[11px] text-indigo-600 font-mono flex-shrink-0">
                        score {r.score.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {kb_items.length === 0 && (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center">
          <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-600 font-medium">Nenhum item adicionado ainda</p>
          <p className="text-xs text-slate-500 mt-1">
            Adicione FAQs, políticas ou informações de produtos para o agente consultar.
          </p>
        </div>
      )}

      <div className="flex justify-between items-center">
        <Button onClick={() => wizard.goBack()} variant="outline">
          ← Voltar
        </Button>
        <div className="flex items-center gap-3">
          {kb_items.length === 0 && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <SkipForward className="w-3 h-3" /> Você pode pular esta etapa
            </span>
          )}
          <Button onClick={() => wizard.goNext()}>Próximo passo →</Button>
        </div>
      </div>
    </div>
  )
}

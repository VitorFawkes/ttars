import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { KbItem } from '@/hooks/useAgentWizard'
import type { useAgentWizard } from '@/hooks/useAgentWizard'
import { Trash2, Copy } from 'lucide-react'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

export default function Step4_KnowledgeBase({ wizard }: WizardProps) {
  const step4 = wizard.wizardData.step4 || {}
  const kb_items = (step4.kb_items || []) as KbItem[]
  const [hasKB, setHasKB] = useState(kb_items.length > 0)
  const [pasteText, setPasteText] = useState('')
  const [parsedItems, setParsedItems] = useState<KbItem[]>([])

  const parseFAQText = (text: string): KbItem[] => {
    if (!text.trim()) return []

    const items: KbItem[] = []
    const blocks = text.split('\n\n').filter((block) => block.trim())

    blocks.forEach((block) => {
      const lines = block.split('\n').filter((line) => line.trim())
      if (lines.length > 0) {
        const titulo = lines[0].trim()
        const conteudo = lines.slice(1).join('\n').trim()
        if (titulo && conteudo) {
          items.push({
            titulo,
            conteudo,
            tags: [],
          })
        }
      }
    })

    return items
  }

  const handlePaste = () => {
    if (!pasteText.trim()) return
    const items = parseFAQText(pasteText)
    setParsedItems(items)
  }

  const handleConfirmItems = () => {
    const newItems = [...kb_items, ...parsedItems]
    wizard.updateStep('step4', { kb_items: newItems })
    setPasteText('')
    setParsedItems([])
  }

  const handleDeleteItem = (index: number) => {
    const newItems = kb_items.filter((_, i) => i !== index)
    wizard.updateStep('step4', { kb_items: newItems })
    if (newItems.length === 0) {
      setHasKB(false)
    }
  }

  const handleRemoveParsedItem = (index: number) => {
    setParsedItems(parsedItems.filter((_, i) => i !== index))
  }

  const handleNext = () => {
    wizard.goNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Base de Conhecimento</h2>
        <p className="text-slate-500 mt-2">
          Configure FAQ ou documentos para melhorar as respostas do seu agente.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={hasKB}
              onChange={(e) => setHasKB(e.target.checked)}
              className="mr-3 rounded border-slate-300"
            />
            <span className="text-slate-900 font-medium">
              Seu agente precisa de FAQ ou documentos?
            </span>
          </label>
        </div>

        {hasKB && (
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div className="space-y-2">
              <Label htmlFor="paste-text">Cole FAQ ou documentos</Label>
              <p className="text-xs text-slate-500">
                Separe cada item com uma linha em branco. Primeira linha = título, resto = conteúdo.
              </p>
              <Textarea
                id="paste-text"
                placeholder={`Pergunta 1: Como faço para...?
Resposta detalhada aqui.

Pergunta 2: Qual é o horário...?
Resposta aqui com todos os detalhes.`}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="min-h-[150px] font-mono text-xs"
              />
              <Button
                onClick={handlePaste}
                disabled={!pasteText.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Parsear Texto
              </Button>
            </div>

            {parsedItems.length > 0 && (
              <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-900">
                    {parsedItems.length} item(ns) para adicionar
                  </h4>
                  <Button
                    onClick={handleConfirmItems}
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Confirmar
                  </Button>
                </div>

                <div className="space-y-2 max-h-[200px] overflow-auto">
                  {parsedItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white border border-slate-200 rounded p-3 text-sm space-y-1"
                    >
                      <p className="font-semibold text-slate-900">{item.titulo}</p>
                      <p className="text-slate-600 line-clamp-2">{item.conteudo}</p>
                      <button
                        onClick={() => handleRemoveParsedItem(idx)}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {kb_items.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <h4 className="font-semibold text-slate-900">
                  Base de Conhecimento ({kb_items.length} item(ns))
                </h4>

                <div className="space-y-2 max-h-[300px] overflow-auto">
                  {kb_items.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-50 border border-slate-200 rounded p-3 flex items-start justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm">{item.titulo}</p>
                        <p className="text-slate-600 text-xs line-clamp-2 mt-1">
                          {item.conteudo}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteItem(idx)}
                        className="p-1 rounded hover:bg-red-100 text-red-600 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!hasKB && kb_items.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
            <p className="text-yellow-800">
              Você tem {kb_items.length} item(ns) na base de conhecimento, mas a opção está desativada.
              Ative para usá-los.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button
          onClick={() => wizard.goBack()}
          variant="outline"
          className="text-slate-900 border-slate-200"
        >
          Voltar
        </Button>
        <Button
          onClick={handleNext}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          Próximo
        </Button>
      </div>
    </div>
  )
}

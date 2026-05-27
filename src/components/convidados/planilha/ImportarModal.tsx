import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Upload, FileText, FileSpreadsheet, ArrowRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { downloadCSV } from '../../../lib/convidados/csvConvites'
import { modeloCSVContent } from '../../../lib/convidados/csvModelo'

interface Props {
  open: boolean
  onClose: () => void
  onImport: (csvText: string) => void
}

export function ImportarModal({ open, onClose, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [baixouModelo, setBaixouModelo] = useState(false)

  if (!open) return null

  const handleBaixarModelo = () => {
    downloadCSV('modelo-lista-convidados.csv', modeloCSVContent())
    setBaixouModelo(true)
  }

  const handleEscolherArquivo = () => fileRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const text = await f.text()
    onImport(text)
    e.target.value = ''
    onClose()
  }

  const node = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(33,31,29,0.42)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[480px] bg-white rounded-xl shadow-ww-modal flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-ww-sand">
          <div>
            <h2 className="font-ww-serif italic text-lg text-ww-n700">Importar lista pronta</h2>
            <p className="text-xs text-ww-n500 mt-0.5">
              Já tem a lista numa planilha? Importe direto aqui.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-ww-cream text-ww-n500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 flex flex-col gap-4">
          {/* Passo 1: baixar modelo */}
          <Step
            num={1}
            title="Sua planilha precisa seguir este modelo"
            desc="Colunas: Nome do convite, Pessoa, Idade, Telefone, Lado, Tipo, Observação. Já tem exemplos preenchidos pra você ver como funciona."
            done={baixouModelo}
          >
            <button
              type="button"
              onClick={handleBaixarModelo}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 px-3 h-9 text-sm font-medium rounded-md border transition-colors',
                baixouModelo
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-ww-sand-dk bg-white text-ww-n700 hover:bg-ww-cream',
              )}
            >
              <FileText className="w-4 h-4" />
              {baixouModelo ? 'Modelo baixado ✓' : 'Baixar planilha modelo'}
            </button>
          </Step>

          {/* Passo 2: escolher arquivo */}
          <Step
            num={2}
            title="Selecione sua planilha preenchida"
            desc="Aceita arquivos .csv (também serve Excel/Numbers — basta exportar como CSV)."
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
            <button
              type="button"
              onClick={handleEscolherArquivo}
              className="inline-flex items-center justify-center gap-1.5 px-3 h-9 text-sm font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors"
            >
              <Upload className="w-4 h-4" />
              Escolher arquivo CSV
            </button>
          </Step>

          {/* Aviso opcional */}
          <div className="flex items-start gap-2 px-3 py-2 bg-ww-paper border border-ww-sand rounded-md">
            <FileSpreadsheet className="w-4 h-4 text-ww-gold mt-0.5 shrink-0" />
            <p className="text-[12px] text-ww-n600 leading-relaxed">
              Os convites e pessoas importados <strong>são adicionados</strong> à lista atual —
              nada é apagado. Se quiser começar do zero, exclua os convites existentes antes.
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ww-sand">
          <button type="button" onClick={onClose} className="px-3 h-9 text-sm text-ww-n600 hover:text-ww-n700">
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  )
  return createPortal(node, document.body)
}

interface StepProps {
  num: number
  title: string
  desc: string
  done?: boolean
  children: React.ReactNode
}
function Step({ num, title, desc, done, children }: StepProps) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          'shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center text-sm font-semibold border',
          done
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : 'bg-ww-gold-soft border-ww-gold/30 text-ww-gold-ink',
        )}
      >
        {done ? <ArrowRight className="w-3.5 h-3.5" /> : num}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ww-n700">{title}</p>
        <p className="text-xs text-ww-n500 mt-0.5 mb-2 leading-relaxed">{desc}</p>
        {children}
      </div>
    </div>
  )
}

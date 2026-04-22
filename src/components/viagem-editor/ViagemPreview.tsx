import { ExternalLink, RefreshCw } from 'lucide-react'
import { useState } from 'react'

interface Props {
  publicToken: string
}

export function ViagemPreview({ publicToken }: Props) {
  const [key, setKey] = useState(0)
  const previewUrl = `/v/${publicToken}`

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview do cliente</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setKey((k) => k + 1)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Recarregar preview"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Abrir em nova aba"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-hidden bg-slate-100 p-3">
        {/* Mobile frame simulation */}
        <div className="relative flex h-full max-h-[680px] w-[360px] shrink-0 flex-col overflow-hidden rounded-[2.5rem] border-4 border-slate-700 shadow-2xl">
          {/* Notch */}
          <div className="absolute left-1/2 top-0 z-10 h-6 w-24 -translate-x-1/2 rounded-b-xl bg-slate-700" />
          <iframe
            key={key}
            src={previewUrl}
            title="Preview do cliente"
            className="h-full w-full border-0 bg-white"
            sandbox="allow-same-origin allow-scripts allow-forms"
          />
        </div>
      </div>
    </div>
  )
}

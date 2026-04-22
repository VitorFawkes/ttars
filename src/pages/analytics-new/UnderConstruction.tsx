import { Construction } from 'lucide-react'

interface Props {
  title: string
  phase: string
  description?: string
}

export default function UnderConstruction({ title, phase, description }: Props) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-10 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 flex-shrink-0">
          <Construction className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">Em construção — entrega na {phase}.</p>
          {description && <p className="mt-3 text-sm text-slate-600">{description}</p>}
        </div>
      </div>
    </div>
  )
}

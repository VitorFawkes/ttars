import { Construction } from 'lucide-react'

interface Props {
  title: string
  description: string
}

export default function ComingSoonDashboard({ title, description }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </header>

      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
          <Construction className="w-8 h-8 text-indigo-600" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">Em construção</h3>
        <p className="text-sm text-slate-500 mt-2 max-w-md">
          O motor (13 consultas novas + interpretador IA) já está no ar. A tela deste painel vem na próxima rodada.
          Enquanto isso, use o painel <strong>Dono</strong> pra visão macro ou <strong>Explorar</strong> pra
          consultas sob medida.
        </p>
      </div>
    </div>
  )
}

import { Outlet } from 'react-router-dom'

export default function ConvidadosLayout() {
  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-auto flex flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
        <PoweredByGuesties />
      </div>
    </div>
  )
}

function PoweredByGuesties() {
  return (
    <div className="mt-8 py-5 px-6 flex items-center justify-center gap-2">
      <span className="text-xs text-slate-400 font-medium">Powered by</span>
      <img
        src="/guesties-logo.png"
        alt="Guesties"
        className="h-5 w-auto opacity-70"
      />
    </div>
  )
}

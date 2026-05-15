import { Outlet } from 'react-router-dom'

export default function ConvidadosLayout() {
  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}

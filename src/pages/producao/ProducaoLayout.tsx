import { Outlet } from 'react-router-dom'

export default function ProducaoLayout() {
  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex-1 overflow-auto flex flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

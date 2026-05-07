import { useConciergeUsers } from '../../../hooks/concierge/useConciergeUsers'

interface ResponsavelSelectProps {
  value: string
  onChange: (value: string) => void
}

export function ResponsavelSelect({ value, onChange }: ResponsavelSelectProps) {
  const conciergeUsers = useConciergeUsers()

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
        Atribuir a
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
      >
        <option value="">Eu mesmo (padrão)</option>
        {conciergeUsers.map((u) => (
          <option key={u.id} value={u.id}>{u.nome}</option>
        ))}
      </select>
      {conciergeUsers.length === 0 && (
        <p className="mt-1 text-[11px] text-slate-500">
          Nenhum concierge cadastrado nesta workspace.
        </p>
      )}
    </div>
  )
}

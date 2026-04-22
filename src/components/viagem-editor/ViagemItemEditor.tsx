import { useState } from 'react'
import { Hotel, Plane, Car, MapPin, UtensilsCrossed, ShieldCheck, Lightbulb, FileText, Contact, CheckSquare, Ticket } from 'lucide-react'
import type { TripItemTipo, TripItemStatus } from '@/types/viagem'
import type { TripItemInterno } from '@/hooks/viagem/useViagemInterna'
import { useUpdateTripItem } from '@/hooks/viagem/useViagemInterna'

const TIPO_LABEL: Record<TripItemTipo, string> = {
  dia: 'Dia',
  hotel: 'Hospedagem',
  voo: 'Voo',
  transfer: 'Transfer',
  passeio: 'Passeio',
  refeicao: 'Refeição',
  seguro: 'Seguro',
  dica: 'Dica',
  voucher: 'Voucher',
  contato: 'Contato',
  texto: 'Texto',
  checklist: 'Checklist',
}

const TIPO_ICON: Record<TripItemTipo, typeof Hotel> = {
  dia: MapPin,
  hotel: Hotel,
  voo: Plane,
  transfer: Car,
  passeio: MapPin,
  refeicao: UtensilsCrossed,
  seguro: ShieldCheck,
  dica: Lightbulb,
  voucher: Ticket,
  contato: Contact,
  texto: FileText,
  checklist: CheckSquare,
}

const STATUS_OPTIONS: { value: TripItemStatus; label: string }[] = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'proposto', label: 'Proposto' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'recusado', label: 'Recusado' },
  { value: 'operacional', label: 'Operacional' },
  { value: 'vivido', label: 'Vivido' },
  { value: 'arquivado', label: 'Arquivado' },
]

type Tab = 'operacional' | 'comercial'

interface Props {
  item: TripItemInterno
}

export function ViagemItemEditor({ item }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(item.tipo === 'dia' ? 'comercial' : 'operacional')
  const updateItem = useUpdateTripItem()

  const Icon = TIPO_ICON[item.tipo] ?? FileText
  const op = item.operacional as Record<string, string | number | null>
  const com = item.comercial as Record<string, string | number | null>

  const saveOperacional = (patch: Record<string, unknown>) => {
    updateItem.mutate({
      id: item.id,
      operacional: { ...item.operacional, ...patch },
    })
  }

  const saveComercial = (patch: Record<string, unknown>) => {
    updateItem.mutate({
      id: item.id,
      comercial: { ...item.comercial, ...patch },
    })
  }

  const saveStatus = (status: TripItemStatus) => {
    updateItem.mutate({ id: item.id, status })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Item header */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
          <Icon className="h-4 w-4 text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{TIPO_LABEL[item.tipo]}</p>
          <p className="truncate text-sm font-semibold text-slate-900">
            {(com.titulo as string) || (com.descricao as string) || `Item ${item.tipo}`}
          </p>
        </div>
        <select
          value={item.status}
          onChange={(e) => saveStatus(e.target.value as TripItemStatus)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      {item.tipo !== 'dia' && (
        <div className="flex border-b border-slate-200">
          {(['operacional', 'comercial'] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-medium capitalize transition ${
                activeTab === tab
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'operacional' ? 'Operacional' : 'Comercial'}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {(activeTab === 'operacional' && item.tipo !== 'dia') ? (
          <OperacionalForm item={item} op={op} onSave={saveOperacional} saving={updateItem.isPending} />
        ) : (
          <ComercialForm item={item} com={com} onSave={saveComercial} saving={updateItem.isPending} />
        )}
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onBlur, placeholder }: { value: string; onBlur: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value)
  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onBlur(local)}
      placeholder={placeholder}
      className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    />
  )
}

function TextareaInput({ value, onBlur, placeholder }: { value: string; onBlur: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value)
  return (
    <textarea
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onBlur(local)}
      placeholder={placeholder}
      rows={3}
      className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
    />
  )
}

function OperacionalForm({
  item,
  op,
  onSave,
  saving,
}: {
  item: TripItemInterno
  op: Record<string, string | number | null>
  onSave: (patch: Record<string, unknown>) => void
  saving: boolean
}) {
  const isHotel = item.tipo === 'hotel'
  const isVoo = item.tipo === 'voo'
  const isTransfer = item.tipo === 'transfer'

  return (
    <div>
      <FieldRow label="Fornecedor">
        <TextInput
          value={String(op.fornecedor ?? '')}
          onBlur={(v) => onSave({ fornecedor: v })}
          placeholder="Nome do fornecedor"
        />
      </FieldRow>

      {(isHotel || isVoo || isTransfer) && (
        <FieldRow label="Representante / Contato">
          <TextInput
            value={String(op.representante ?? '')}
            onBlur={(v) => onSave({ representante: v })}
            placeholder="Nome do contato no fornecedor"
          />
        </FieldRow>
      )}

      <FieldRow label="Nº Reserva / Voucher">
        <TextInput
          value={String(op.numero_reserva ?? '')}
          onBlur={(v) => onSave({ numero_reserva: v })}
          placeholder="Código ou número de reserva"
        />
      </FieldRow>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Data início</label>
          <input
            type="date"
            defaultValue={String(op.data_inicio ?? '')}
            onBlur={(e) => onSave({ data_inicio: e.target.value || null })}
            className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Data fim</label>
          <input
            type="date"
            defaultValue={String(op.data_fim ?? '')}
            onBlur={(e) => onSave({ data_fim: e.target.value || null })}
            className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <FieldRow label="Observações operacionais">
        <TextareaInput
          value={String(op.observacoes ?? '')}
          onBlur={(v) => onSave({ observacoes: v })}
          placeholder="Instruções internas, alertas, notas de operação..."
        />
      </FieldRow>

      {saving && (
        <p className="text-center text-xs text-slate-400">Salvando...</p>
      )}
    </div>
  )
}

function ComercialForm({
  item,
  com,
  onSave,
  saving,
}: {
  item: TripItemInterno
  com: Record<string, string | number | null>
  onSave: (patch: Record<string, unknown>) => void
  saving: boolean
}) {
  return (
    <div>
      <FieldRow label="Título">
        <TextInput
          value={String(com.titulo ?? '')}
          onBlur={(v) => onSave({ titulo: v })}
          placeholder={item.tipo === 'dia' ? 'Ex: Dia 1 — Paris' : 'Título do item'}
        />
      </FieldRow>

      {item.tipo !== 'dia' && (
        <FieldRow label="Preço (R$)">
          <input
            type="number"
            defaultValue={com.preco !== null && com.preco !== undefined ? Number(com.preco) : ''}
            onBlur={(e) => onSave({ preco: e.target.value ? Number(e.target.value) : null })}
            placeholder="0,00"
            className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </FieldRow>
      )}

      <FieldRow label="Descrição">
        <TextareaInput
          value={String(com.descricao ?? '')}
          onBlur={(v) => onSave({ descricao: v })}
          placeholder="Descrição visível ao cliente..."
        />
      </FieldRow>

      {saving && (
        <p className="text-center text-xs text-slate-400">Salvando...</p>
      )}
    </div>
  )
}

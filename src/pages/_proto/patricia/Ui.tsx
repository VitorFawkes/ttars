/**
 * Primitivas visuais compartilhadas — Light Mode First.
 * Sem glassmorphism, sem gradient. Cards sólidos bg-white.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({
  title, hint, children, actions, dense,
}: {
  title?: string
  hint?: string
  children: ReactNode
  actions?: ReactNode
  dense?: boolean
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
      {(title || actions) && (
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {title && <h3 className="text-[13px] font-semibold text-slate-900 tracking-tight">{title}</h3>}
            {hint && <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{hint}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      )}
      <div className={dense ? 'p-0' : 'p-5'}>{children}</div>
    </section>
  )
}

type PillTone = 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: PillTone }) {
  const tones: Record<PillTone, string> = {
    slate: 'bg-slate-100 text-slate-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    sky: 'bg-sky-50 text-sky-700',
    violet: 'bg-violet-50 text-violet-700',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded', tones[tone])}>
      {children}
    </span>
  )
}

type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger'

export function Btn({
  variant = 'outline', children, icon, className, onClick, disabled, type = 'button',
}: {
  variant?: BtnVariant
  children: ReactNode
  icon?: ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}) {
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    outline: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-white border border-rose-200 text-rose-700 hover:bg-rose-50',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function Field({
  label, hint, required, children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-600 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 leading-relaxed">{hint}</p>}
    </div>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none transition-shadow',
        props.className,
      )}
    />
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none resize-y transition-shadow leading-relaxed',
        props.className,
      )}
    />
  )
}

export function Toggle({
  checked, onChange,
}: {
  checked: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
        checked ? 'bg-indigo-600' : 'bg-slate-200',
      )}
    >
      <span className={cn(
        'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform',
        checked ? 'translate-x-[18px]' : 'translate-x-0.5',
      )} />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Edit primitives — row com ações no hover, adicionar, editar inline
// ─────────────────────────────────────────────────────────────────────────────

import { Pencil, Trash2, Plus, Check, X } from 'lucide-react'
import { useState as useEditState } from 'react'

export function RowActions({
  onEdit, onRemove,
}: {
  onEdit?: () => void
  onRemove?: () => void
}) {
  return (
    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 flex-shrink-0">
      {onEdit && (
        <button
          onClick={onEdit}
          className="w-6 h-6 grid place-items-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
          aria-label="Editar"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="w-6 h-6 grid place-items-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
          aria-label="Remover"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

export function AddButton({
  label, onClick, className,
}: {
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 text-[12px] font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2.5 py-1.5 rounded-md transition-colors',
        className,
      )}
    >
      <Plus className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

/** Input inline pra adicionar item — aparece quando user clica em "+ Adicionar". */
export function InlineAdd({
  placeholder, onAdd, onCancel, multiline,
}: {
  placeholder: string
  onAdd: (value: string) => void
  onCancel: () => void
  multiline?: boolean
}) {
  const [value, setValue] = useEditState('')

  const save = () => {
    if (value.trim()) {
      onAdd(value.trim())
      setValue('')
    }
  }

  const InputComp = multiline ? 'textarea' : 'input'

  return (
    <div className="flex items-start gap-2 p-2 border border-indigo-200 bg-indigo-50/30 rounded-lg">
      <InputComp
        autoFocus
        type={multiline ? undefined : 'text'}
        rows={multiline ? 2 : undefined}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (!multiline && e.key === 'Enter') { e.preventDefault(); save() }
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={placeholder}
        className="flex-1 px-2 py-1 text-[13px] bg-white border border-slate-200 rounded focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
      />
      <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
        <button
          onClick={save}
          disabled={!value.trim()}
          className="w-7 h-7 grid place-items-center text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Salvar"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onCancel}
          className="w-7 h-7 grid place-items-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
          aria-label="Cancelar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

/** Edit inline de texto — click no row, troca pra textarea, salva com ✓ */
export function InlineEdit({
  value, onSave, onCancel, multiline,
}: {
  value: string
  onSave: (next: string) => void
  onCancel: () => void
  multiline?: boolean
}) {
  const [v, setV] = useEditState(value)
  const InputComp = multiline ? 'textarea' : 'input'

  return (
    <div className="flex items-start gap-2 w-full">
      <InputComp
        autoFocus
        type={multiline ? undefined : 'text'}
        rows={multiline ? 3 : undefined}
        value={v}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (!multiline && e.key === 'Enter') { e.preventDefault(); onSave(v) }
          if (e.key === 'Escape') onCancel()
        }}
        className="flex-1 px-2 py-1 text-[13px] bg-white border border-indigo-300 rounded focus:ring-2 focus:ring-indigo-100 outline-none"
      />
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={() => onSave(v)}
          className="w-7 h-7 grid place-items-center text-emerald-600 hover:bg-emerald-50 rounded"
          aria-label="Salvar"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onCancel}
          className="w-7 h-7 grid place-items-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
          aria-label="Cancelar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export function ChapterHeader({
  num, total, title, subtitle,
}: {
  num: number
  total: number
  title: string
  subtitle: string
}) {
  return (
    <header className="mb-7">
      <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-500 mb-1.5">
        Passo {num} de {total}
      </p>
      <h1 className="text-[26px] font-semibold text-slate-900 tracking-tight leading-tight">{title}</h1>
      <p className="text-[14px] text-slate-500 mt-1.5 max-w-2xl leading-relaxed">{subtitle}</p>
    </header>
  )
}

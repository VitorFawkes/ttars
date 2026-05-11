import { Phone, Mail, Plus, Trash2, Star } from 'lucide-react'
import { Input } from '../ui/Input'
import { cn } from '../../lib/utils'

export interface ContactMethod {
    id?: string
    tipo: 'telefone' | 'email'
    valor: string
    is_principal: boolean
}

interface MultiContactInputProps {
    telefones: ContactMethod[]
    emails: ContactMethod[]
    onTelefonesChange: (telefones: ContactMethod[]) => void
    onEmailsChange: (emails: ContactMethod[]) => void
    className?: string
}

export default function MultiContactInput({
    telefones,
    emails,
    onTelefonesChange,
    onEmailsChange,
    className
}: MultiContactInputProps) {

    const addTelefone = () => {
        const hasPrincipal = telefones.some(t => t.is_principal)
        onTelefonesChange([
            ...telefones,
            { tipo: 'telefone', valor: '', is_principal: !hasPrincipal }
        ])
    }

    const addEmail = () => {
        const hasPrincipal = emails.some(e => e.is_principal)
        onEmailsChange([
            ...emails,
            { tipo: 'email', valor: '', is_principal: !hasPrincipal }
        ])
    }

    const updateTelefone = (index: number, valor: string) => {
        const newTelefones = [...telefones]
        newTelefones[index] = { ...newTelefones[index], valor }
        onTelefonesChange(newTelefones)
    }

    const updateEmail = (index: number, valor: string) => {
        const newEmails = [...emails]
        newEmails[index] = { ...newEmails[index], valor }
        onEmailsChange(newEmails)
    }

    const removeTelefone = (index: number) => {
        const newTelefones = telefones.filter((_, i) => i !== index)
        // If removed was principal, make first one principal
        if (telefones[index].is_principal && newTelefones.length > 0) {
            newTelefones[0].is_principal = true
        }
        onTelefonesChange(newTelefones)
    }

    const removeEmail = (index: number) => {
        const newEmails = emails.filter((_, i) => i !== index)
        if (emails[index].is_principal && newEmails.length > 0) {
            newEmails[0].is_principal = true
        }
        onEmailsChange(newEmails)
    }

    const setPrincipalTelefone = (index: number) => {
        const newTelefones = telefones.map((t, i) => ({
            ...t,
            is_principal: i === index
        }))
        onTelefonesChange(newTelefones)
    }

    const setPrincipalEmail = (index: number) => {
        const newEmails = emails.map((e, i) => ({
            ...e,
            is_principal: i === index
        }))
        onEmailsChange(newEmails)
    }

    return (
        <div className={cn('space-y-6', className)}>
            {/* Phones */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <Phone className="h-4 w-4 text-slate-500" />
                        Telefones
                    </label>
                    <button
                        type="button"
                        onClick={addTelefone}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar
                    </button>
                </div>

                {telefones.length === 0 ? (
                    <button
                        type="button"
                        onClick={addTelefone}
                        className="w-full p-3 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                    >
                        + Adicionar telefone
                    </button>
                ) : (
                    <div className="space-y-2">
                        {telefones.map((tel, index) => (
                            <div key={index} className={cn(
                                'flex items-center gap-2 p-2 rounded-lg transition-all',
                                tel.is_principal && 'bg-indigo-50 border border-indigo-200'
                            )}>
                                <div className="flex-1 relative">
                                    <Input
                                        type="tel"
                                        value={tel.valor}
                                        onChange={(e) => updateTelefone(index, e.target.value)}
                                        placeholder="(11) 99999-9999"
                                        className={cn(
                                            tel.is_principal && 'border-indigo-300'
                                        )}
                                    />
                                    {tel.is_principal && (
                                        <span className="absolute -top-2 left-3 px-1.5 py-0.5 bg-indigo-600 text-white text-[10px] font-semibold rounded">
                                            PRINCIPAL
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPrincipalTelefone(index)}
                                    className={cn(
                                        'p-2 rounded-lg transition-colors flex items-center gap-1',
                                        tel.is_principal
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200'
                                    )}
                                    title={tel.is_principal ? 'Este é o principal' : 'Definir como principal'}
                                >
                                    <Star className={cn('h-3.5 w-3.5', tel.is_principal && 'fill-current')} />
                                    {!tel.is_principal && <span className="text-xs hidden sm:inline">Principal</span>}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removeTelefone(index)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Emails */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <Mail className="h-4 w-4 text-slate-500" />
                        Emails
                    </label>
                    <button
                        type="button"
                        onClick={addEmail}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar
                    </button>
                </div>

                {emails.length === 0 ? (
                    <button
                        type="button"
                        onClick={addEmail}
                        className="w-full p-3 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                    >
                        + Adicionar email
                    </button>
                ) : (
                    <div className="space-y-2">
                        {emails.map((email, index) => (
                            <div key={index} className={cn(
                                'flex items-center gap-2 p-2 rounded-lg transition-all',
                                email.is_principal && 'bg-indigo-50 border border-indigo-200'
                            )}>
                                <div className="flex-1 relative">
                                    <Input
                                        type="email"
                                        value={email.valor}
                                        onChange={(e) => updateEmail(index, e.target.value)}
                                        placeholder="email@exemplo.com"
                                        className={cn(
                                            email.is_principal && 'border-indigo-300'
                                        )}
                                    />
                                    {email.is_principal && (
                                        <span className="absolute -top-2 left-3 px-1.5 py-0.5 bg-indigo-600 text-white text-[10px] font-semibold rounded">
                                            PRINCIPAL
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPrincipalEmail(index)}
                                    className={cn(
                                        'p-2 rounded-lg transition-colors flex items-center gap-1',
                                        email.is_principal
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200'
                                    )}
                                    title={email.is_principal ? 'Este é o principal' : 'Definir como principal'}
                                >
                                    <Star className={cn('h-3.5 w-3.5', email.is_principal && 'fill-current')} />
                                    {!email.is_principal && <span className="text-xs hidden sm:inline">Principal</span>}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removeEmail(index)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

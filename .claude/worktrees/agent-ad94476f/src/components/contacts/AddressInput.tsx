import { useState, useEffect } from 'react'
import { Search, Loader2, CheckCircle } from 'lucide-react'
import { Input } from '../ui/Input'
import { cn } from '../../lib/utils'

interface Address {
    cep: string
    logradouro: string
    numero: string
    complemento: string
    bairro: string
    cidade: string
    estado: string
}

interface AddressInputProps {
    value: Address | null
    onChange: (address: Address) => void
    className?: string
}

const EMPTY_ADDRESS: Address = {
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: ''
}

export default function AddressInput({ value, onChange, className }: AddressInputProps) {
    const [address, setAddress] = useState<Address>(value || EMPTY_ADDRESS)
    const [loading, setLoading] = useState(false)
    const [cepFound, setCepFound] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (value) setAddress(value)
    }, [value])

    const handleCepChange = async (cep: string) => {
        // Remove non-digits
        const cleanCep = cep.replace(/\D/g, '')
        setAddress(prev => ({ ...prev, cep: cleanCep }))
        setCepFound(false)
        setError(null)

        if (cleanCep.length === 8) {
            setLoading(true)
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
                const data = await response.json()

                if (data.erro) {
                    setError('CEP não encontrado')
                } else {
                    const newAddress = {
                        ...address,
                        cep: cleanCep,
                        logradouro: data.logradouro || '',
                        bairro: data.bairro || '',
                        cidade: data.localidade || '',
                        estado: data.uf || ''
                    }
                    setAddress(newAddress)
                    onChange(newAddress)
                    setCepFound(true)
                }
            } catch {
                setError('Erro ao buscar CEP')
            } finally {
                setLoading(false)
            }
        }
    }

    const handleFieldChange = (field: keyof Address, value: string) => {
        const newAddress = { ...address, [field]: value }
        setAddress(newAddress)
        onChange(newAddress)
    }

    const formatCep = (cep: string) => {
        if (cep.length <= 5) return cep
        return `${cep.slice(0, 5)}-${cep.slice(5, 8)}`
    }

    return (
        <div className={cn('space-y-4', className)}>
            {/* CEP with auto-search */}
            <div className="flex gap-3">
                <div className="relative flex-1 max-w-[180px]">
                    <Input
                        type="text"
                        value={formatCep(address.cep)}
                        onChange={(e) => handleCepChange(e.target.value)}
                        placeholder="00000-000"
                        maxLength={9}
                        className="pr-10"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        ) : cepFound ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                            <Search className="h-4 w-4 text-slate-400" />
                        )}
                    </div>
                </div>
                {error && (
                    <span className="text-sm text-red-500 self-center">{error}</span>
                )}
            </div>

            {/* Street */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Rua / Logradouro
                </label>
                <Input
                    type="text"
                    value={address.logradouro}
                    onChange={(e) => handleFieldChange('logradouro', e.target.value)}
                    placeholder="Av. Paulista"
                />
            </div>

            {/* Number + Complement */}
            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Número
                    </label>
                    <Input
                        type="text"
                        value={address.numero}
                        onChange={(e) => handleFieldChange('numero', e.target.value)}
                        placeholder="123"
                    />
                </div>
                <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Complemento
                    </label>
                    <Input
                        type="text"
                        value={address.complemento}
                        onChange={(e) => handleFieldChange('complemento', e.target.value)}
                        placeholder="Apto 101"
                    />
                </div>
            </div>

            {/* Neighborhood */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Bairro
                </label>
                <Input
                    type="text"
                    value={address.bairro}
                    onChange={(e) => handleFieldChange('bairro', e.target.value)}
                    placeholder="Centro"
                />
            </div>

            {/* City + State */}
            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Cidade
                    </label>
                    <Input
                        type="text"
                        value={address.cidade}
                        onChange={(e) => handleFieldChange('cidade', e.target.value)}
                        placeholder="São Paulo"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        UF
                    </label>
                    <Input
                        type="text"
                        value={address.estado}
                        onChange={(e) => handleFieldChange('estado', e.target.value.toUpperCase())}
                        placeholder="SP"
                        maxLength={2}
                    />
                </div>
            </div>
        </div>
    )
}

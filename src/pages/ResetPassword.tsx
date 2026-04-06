import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Password policy (Sprint C.1 endurece, mas já deixo o básico aqui)
const MIN_LENGTH = 12

function validatePassword(pwd: string): string | null {
    if (pwd.length < MIN_LENGTH) return `Senha deve ter no mínimo ${MIN_LENGTH} caracteres`
    if (!/[a-z]/.test(pwd)) return 'Senha deve conter ao menos uma letra minúscula'
    if (!/[A-Z]/.test(pwd)) return 'Senha deve conter ao menos uma letra maiúscula'
    if (!/\d/.test(pwd)) return 'Senha deve conter ao menos um número'
    return null
}

export default function ResetPassword() {
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [validSession, setValidSession] = useState<boolean | null>(null)

    // Verificar que chegamos aqui com sessão válida (vinda do link do email)
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setValidSession(!!session)
        })
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        const validationError = validatePassword(password)
        if (validationError) {
            setError(validationError)
            return
        }

        if (password !== confirmPassword) {
            setError('As senhas não coincidem')
            return
        }

        setLoading(true)
        try {
            const { error } = await supabase.auth.updateUser({ password })
            if (error) throw error
            setSuccess(true)
            setTimeout(() => navigate('/dashboard'), 2000)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Erro ao redefinir senha'
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    if (validSession === null) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
            </div>
        )
    }

    if (validSession === false) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
                <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md text-center space-y-4">
                    <h1 className="text-xl font-semibold text-slate-900">Link inválido ou expirado</h1>
                    <p className="text-sm text-slate-500">
                        O link de recuperação de senha expirou ou já foi usado.
                        Solicite um novo link.
                    </p>
                    <button
                        onClick={() => navigate('/forgot-password')}
                        className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                    >
                        Solicitar novo link
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-md">
                <div className="flex flex-col items-center">
                    <img
                        src="/logo-light.png"
                        alt="WelcomeCRM"
                        className="w-48 object-contain"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                    <h1 className="mt-4 text-xl font-semibold text-slate-900">Nova senha</h1>
                    <p className="mt-1 text-sm text-slate-500 text-center">
                        Escolha uma senha segura para sua conta
                    </p>
                </div>

                {success ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-green-900">Senha redefinida!</p>
                            <p className="text-xs text-green-700 mt-1">
                                Redirecionando para o dashboard...
                            </p>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                                Nova senha
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    autoFocus
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none"
                                    placeholder="Mínimo 12 caracteres"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                                Mínimo 12 caracteres, com maiúscula, minúscula e número
                            </p>
                        </div>

                        <div>
                            <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-1.5">
                                Confirmar senha
                            </label>
                            <input
                                id="confirm"
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none"
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !password || !confirmPassword}
                            className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                        >
                            {loading ? 'Salvando...' : 'Redefinir senha'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            // Fluxo custom (template bonito via Resend). Se a edge function
            // falhar, cai no reset nativo do Supabase Auth (fallback transparente).
            const { data, error } = await supabase.functions.invoke('send-password-reset', {
                body: {
                    email,
                    redirect_to: `${window.location.origin}/reset-password`,
                },
            })
            if (error || (data as { error?: string } | null)?.error) {
                const { error: nativeErr } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/reset-password`,
                })
                if (nativeErr) throw nativeErr
            }
            setSent(true)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Erro ao enviar email'
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
                <div className="flex flex-col items-center">
                    <img
                        src="/logo-light.png"
                        alt="WelcomeCRM"
                        className="w-48 object-contain"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                    <h1 className="mt-4 text-xl font-semibold text-slate-900">Recuperar senha</h1>
                    <p className="mt-1 text-sm text-slate-500 text-center">
                        Informe seu email e enviaremos um link para redefinir sua senha
                    </p>
                </div>

                {sent ? (
                    <div className="space-y-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-green-900">Email enviado!</p>
                                <p className="text-xs text-green-700 mt-1">
                                    Se houver uma conta vinculada a <strong>{email}</strong>, você receberá um link em instantes.
                                    Verifique também a caixa de spam.
                                </p>
                            </div>
                        </div>
                        <Link
                            to="/login"
                            className="flex items-center justify-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-500 font-medium"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Voltar ao login
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    autoFocus
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none"
                                    placeholder="seu@email.com"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !email}
                            className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                        >
                            {loading ? 'Enviando...' : 'Enviar link de recuperação'}
                        </button>

                        <Link
                            to="/login"
                            className="flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Voltar ao login
                        </Link>
                    </form>
                )}
            </div>
        </div>
    )
}

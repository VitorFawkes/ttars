import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Loader2, CheckCircle, XCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { TERMS_VERSION, PRIVACY_VERSION, DPA_VERSION } from './legal/versions';

// Password policy — min 12, maiúscula, minúscula, número
const MIN_PASSWORD_LENGTH = 12

function validatePassword(pwd: string): string | null {
    if (pwd.length < MIN_PASSWORD_LENGTH) return `Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres`
    if (!/[a-z]/.test(pwd)) return 'Senha deve conter ao menos uma letra minúscula'
    if (!/[A-Z]/.test(pwd)) return 'Senha deve conter ao menos uma letra maiúscula'
    if (!/\d/.test(pwd)) return 'Senha deve conter ao menos um número'
    return null
}

export default function InvitePage() {
    const { token } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [valid, setValid] = useState(false);
    const [inviteData, setInviteData] = useState<{ email: string; role: string; team_id?: string; team_name?: string; org_id?: string } | null>(null);

    const [sessionEmail, setSessionEmail] = useState<string | null>(null);
    const [emailMismatch, setEmailMismatch] = useState(false);
    const [accepting, setAccepting] = useState(false);

    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (token) {
            validateToken(token);
        }
    }, [token]);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSessionEmail(data.session?.user?.email ?? null);
        });
    }, []);

    useEffect(() => {
        if (sessionEmail && inviteData?.email) {
            setEmailMismatch(sessionEmail.toLowerCase() !== inviteData.email.toLowerCase());
        }
    }, [sessionEmail, inviteData]);

    const validateToken = async (t: string) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await supabase.rpc('get_invite_details' as any, { token_input: t });

            if (error) throw error;

            const result = data as unknown as { id?: string; email: string; role: string; team_id?: string; team_name?: string; org_id?: string } | null;
            if (result && result.email && result.role) {
                setValid(true);
                setInviteData({
                    email: result.email,
                    role: result.role,
                    team_id: result.team_id,
                    team_name: result.team_name,
                    org_id: result.org_id,
                });
            } else {
                setValid(false);
            }
        } catch (error) {
            console.error('Error validating token:', error);
            setValid(false);
        } finally {
            setLoading(false);
        }
    };

    const handleAccept = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validação de senha
        const pwdError = validatePassword(password)
        if (pwdError) {
            toast({ title: 'Senha inválida', description: pwdError, type: 'error' });
            return
        }

        if (password !== confirmPassword) {
            toast({ title: 'Erro', description: 'As senhas não coincidem.', type: 'error' });
            return;
        }

        if (!acceptedTerms) {
            toast({ title: 'Atenção', description: 'Você precisa aceitar os Termos de Uso e a Política de Privacidade.', type: 'error' });
            return
        }

        setSubmitting(true);
        try {
            // 1. Sign Up (trigger handle_new_user usa invite_token para casar a org certa)
            const { data: signUpData, error } = await supabase.auth.signUp({
                email: inviteData!.email,
                password: password,
                options: {
                    data: {
                        full_name: name,
                        role: inviteData!.role,
                        team_id: inviteData!.team_id,
                        invite_token: token,
                    }
                }
            });

            if (error) throw error;

            // 2. Registrar aceite de termos (best-effort — não bloqueia login)
            if (signUpData.user?.id) {
                await supabase
                    .from('terms_acceptance')
                    .insert({
                        user_id: signUpData.user.id,
                        org_id: inviteData?.org_id ?? null,
                        terms_version: TERMS_VERSION,
                        privacy_version: PRIVACY_VERSION,
                        dpa_version: DPA_VERSION,
                        user_agent: navigator.userAgent,
                        context: 'signup',
                    })
                    .then(() => {}, (err) => {
                        console.warn('Failed to log terms acceptance:', err)
                    })
            }

            toast({
                title: 'Conta criada!',
                description: 'Bem-vindo ao WelcomeCRM.',
                type: 'success'
            });

            navigate('/dashboard');

        } catch (error) {
            console.error('Signup error:', error);
            const message = error instanceof Error ? error.message : 'Verifique se o convite ainda é válido.';
            toast({
                title: 'Erro ao criar conta',
                description: message,
                type: 'error'
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleAcceptAsExistingUser = async () => {
        if (!token) return;
        setAccepting(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await supabase.rpc('accept_invite_for_existing_user' as any, { p_token: token });
            if (error) throw error;
            const result = data as { success?: boolean; org_id?: string } | null;
            if (!result?.success) throw new Error('Resposta inesperada do servidor');
            toast({
                title: 'Convite aceito!',
                description: 'Você agora faz parte desta organização. Use o seletor de workspace para alternar.',
                type: 'success',
            });
            navigate('/dashboard');
        } catch (error) {
            console.error('Accept invite error:', error);
            const message = error instanceof Error ? error.message : 'Falha ao aceitar convite.';
            toast({ title: 'Erro ao aceitar convite', description: message, type: 'error' });
        } finally {
            setAccepting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (!valid) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <XCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Convite inválido</h2>
                    <p className="text-gray-500 mb-6">
                        Este link de convite expirou ou não existe. Peça um novo convite ao administrador.
                    </p>
                    <Button onClick={() => navigate('/login')} variant="outline" className="w-full">
                        Voltar para Login
                    </Button>
                </div>
            </div>
        );
    }

    // Usuário já logado — fluxo de aceite direto (2ª+ org)
    if (sessionEmail && !emailMismatch) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-6 h-6 text-indigo-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Aceitar convite</h2>
                    <p className="text-slate-500 mt-2">
                        Você já tem uma conta como <strong>{sessionEmail}</strong>. Este convite será adicionado como um novo workspace.
                    </p>
                    <div className="mt-4 p-3 bg-indigo-50 rounded-lg inline-block">
                        {inviteData?.team_name && (
                            <p className="text-xs text-indigo-600">Time: {inviteData.team_name}</p>
                        )}
                    </div>
                    <Button
                        onClick={handleAcceptAsExistingUser}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-6"
                        disabled={accepting}
                    >
                        {accepting ? (
                            <><Loader2 className="w-4 h-4 animate-spin mr-2" />Aceitando...</>
                        ) : (
                            <>Aceitar convite<ArrowRight className="w-4 h-4 ml-2" /></>
                        )}
                    </Button>
                </div>
            </div>
        );
    }

    if (sessionEmail && emailMismatch) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <XCircle className="w-8 h-8 text-amber-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Email não confere</h2>
                    <p className="text-slate-500 mb-2">
                        Você está logado como <strong>{sessionEmail}</strong>, mas este convite foi enviado para <strong>{inviteData?.email}</strong>.
                    </p>
                    <p className="text-slate-500 mb-6 text-sm">
                        Faça logout e abra o link novamente.
                    </p>
                    <Button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} variant="outline" className="w-full">
                        Fazer logout
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-6 h-6 text-indigo-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">Aceitar convite</h2>
                    <p className="text-gray-500 mt-2">
                        Você foi convidado para o WelcomeCRM.
                    </p>
                    <div className="mt-4 p-3 bg-indigo-50 rounded-lg inline-block">
                        <p className="text-sm font-medium text-indigo-800">{inviteData?.email}</p>
                        {inviteData?.team_name && (
                            <p className="text-xs text-indigo-600 mt-1">Time: {inviteData.team_name}</p>
                        )}
                    </div>
                </div>

                <form onSubmit={handleAccept} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
                        <Input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Seu nome"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Definir senha</label>
                        <div className="relative">
                            <Input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Mínimo 12 caracteres"
                                required
                                className="pr-10"
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
                        <Input
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    <div className="flex items-start gap-2 pt-2">
                        <input
                            id="accept-terms"
                            type="checkbox"
                            checked={acceptedTerms}
                            onChange={(e) => setAcceptedTerms(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                        />
                        <label htmlFor="accept-terms" className="text-xs text-slate-600 leading-relaxed">
                            Li e aceito os{' '}
                            <Link to="/legal/terms" target="_blank" className="text-indigo-600 hover:text-indigo-500 font-medium underline">
                                Termos de Uso
                            </Link>
                            {', a '}
                            <Link to="/legal/privacy" target="_blank" className="text-indigo-600 hover:text-indigo-500 font-medium underline">
                                Política de Privacidade
                            </Link>
                            {' e o '}
                            <Link to="/legal/dpa" target="_blank" className="text-indigo-600 hover:text-indigo-500 font-medium underline">
                                DPA
                            </Link>
                            {' do WelcomeCRM.'}
                        </label>
                    </div>

                    <Button
                        type="submit"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-4"
                        disabled={submitting || !acceptedTerms}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Criando conta...
                            </>
                        ) : (
                            <>
                                Entrar no sistema
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </Button>
                </form>
            </div>
        </div>
    );
}

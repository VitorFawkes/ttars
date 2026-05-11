import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Label } from '../../ui/label';
import { useToast } from '../../../contexts/ToastContext';
import { Loader2, Shield, CheckCircle } from 'lucide-react';

export default function SecuritySettings() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast({ title: 'Erro', description: 'As senhas não coincidem.', type: 'error' });
            return;
        }

        if (password.length < 6) {
            toast({ title: 'Erro', description: 'A senha deve ter no mínimo 6 caracteres.', type: 'error' });
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: password });

            if (error) throw error;

            toast({ title: 'Sucesso', description: 'Sua senha foi atualizada.', type: 'success' });
            setPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            toast({ title: 'Erro', description: error.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-indigo-50/50 rounded-lg border border-indigo-100">
                <div className="p-2 bg-indigo-100 rounded-full">
                    <Shield className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                    <h3 className="font-medium text-indigo-900">Segurança da Conta</h3>
                    <p className="text-sm text-indigo-700">Mantenha sua conta segura usando uma senha forte.</p>
                </div>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
                <div className="space-y-2">
                    <Label>Nova Senha</Label>
                    <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                    />
                </div>
                <div className="space-y-2">
                    <Label>Confirmar Nova Senha</Label>
                    <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                    />
                </div>

                <div className="pt-2">
                    <Button type="submit" disabled={loading || !password}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                        Atualizar Senha
                    </Button>
                </div>
            </form>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Label } from '../../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { useToast } from '../../../contexts/ToastContext';
import { Loader2, Save, User, Shield, BellRing } from 'lucide-react';
import AvatarUpload from './AvatarUpload';
import SecuritySettings from './SecuritySettings';
import NotificationSettings from './NotificationSettings';
import { useSearchParams } from 'react-router-dom';

export default function ProfileSettings() {
    const { user, profile } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') || 'general';
    const [activeTab, setActiveTab] = useState(initialTab);

    // Sync tab from URL changes (e.g. sidebar CTA click)
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && tab !== activeTab) {
            setActiveTab(tab);
        }
    }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        if (value === 'general') {
            searchParams.delete('tab');
        } else {
            searchParams.set('tab', value);
        }
        setSearchParams(searchParams, { replace: true });
    };

    // Form State
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [avatarPath, setAvatarPath] = useState<string | null>(null);

    useEffect(() => {
        if (profile) {
            setName(profile.nome || '');
            setPhone((profile as any).phone || '');
            setAvatarPath((profile as any).avatar_url || null);
        }
    }, [profile]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        try {
            const updates = {
                id: user.id,
                nome: name,
                phone: phone,
                avatar_url: avatarPath,
                updated_at: new Date().toISOString(),
            };

            const { error } = await supabase
                .from('profiles')
                .upsert(updates);

            if (error) throw error;
            toast({ title: 'Perfil atualizado!', type: 'success' });
        } catch (error: any) {
            toast({ title: 'Erro ao atualizar', description: error.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-foreground">Meu Perfil</h2>
                <p className="text-muted-foreground">Gerencie suas informações pessoais e segurança.</p>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-3 lg:w-[600px] mb-8">
                    <TabsTrigger value="general" className="gap-2">
                        <User className="w-4 h-4" />
                        Dados Pessoais
                    </TabsTrigger>
                    <TabsTrigger value="security" className="gap-2">
                        <Shield className="w-4 h-4" />
                        Segurança
                    </TabsTrigger>
                    <TabsTrigger value="notifications" className="gap-2">
                        <BellRing className="w-4 h-4" />
                        Notificações
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-8 animate-in fade-in-50 duration-500">
                    <div className="bg-card rounded-xl border border-border p-8 shadow-sm">
                        <div className="flex flex-col md:flex-row gap-8 items-start">
                            {/* Avatar Section */}
                            <div className="w-full md:w-auto flex-shrink-0">
                                <AvatarUpload
                                    url={avatarPath}
                                    onUpload={(url) => {
                                        setAvatarPath(url);
                                        // Auto-save avatar update
                                        if (user) {
                                            supabase.from('profiles').update({ avatar_url: url } as any).eq('id', user.id).then();
                                        }
                                    }}
                                />
                            </div>

                            {/* Form Section */}
                            <form onSubmit={handleUpdateProfile} className="flex-1 space-y-6 w-full">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label>Nome Completo</Label>
                                        <Input
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            placeholder="Seu nome"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Telefone / WhatsApp</Label>
                                        <Input
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            placeholder="(00) 00000-0000"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input
                                        value={user?.email}
                                        disabled
                                        className="bg-muted text-muted-foreground"
                                    />
                                    <p className="text-xs text-muted-foreground">O email não pode ser alterado.</p>
                                </div>
                                <div className="pt-4 border-t border-border">
                                    <Button type="submit" disabled={loading}>
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                        Salvar Alterações
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="security" className="animate-in fade-in-50 duration-500">
                    <div className="bg-card rounded-xl border border-border p-8 shadow-sm">
                        <SecuritySettings />
                    </div>
                </TabsContent>

                <TabsContent value="notifications" className="animate-in fade-in-50 duration-500">
                    <div className="bg-card rounded-xl border border-border p-8 shadow-sm">
                        <NotificationSettings />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

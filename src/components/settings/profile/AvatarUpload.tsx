import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

import { Loader2, Upload, User } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';

interface AvatarUploadProps {
    url: string | null;
    onUpload: (url: string) => void;
    editable?: boolean;
}

export default function AvatarUpload({ url, onUpload, editable = true }: AvatarUploadProps) {
    const { toast } = useToast();
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (url) downloadImage(url);
    }, [url]);

    async function downloadImage(path: string) {
        try {
            const { data, error } = await supabase.storage.from('avatars').download(path);
            if (error) {
                throw error;
            }
            const url = URL.createObjectURL(data);
            setAvatarUrl(url);
        } catch (error: any) {
            console.error('Error downloading image: ', error.message);
        }
    }

    async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
        try {
            setUploading(true);

            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('You must select an image to upload.');
            }

            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            onUpload(filePath);

            // Trigger download to update view immediately
            downloadImage(filePath);

            toast({ title: 'Sucesso', description: 'Avatar atualizado!', type: 'success' });

        } catch (error: any) {
            toast({ title: 'Erro', description: error.message, type: 'error' });
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="relative group">
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/10 shadow-xl bg-gray-100 flex items-center justify-center">
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <User className="w-16 h-16 text-gray-400" />
                    )}

                    {uploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-white animate-spin" />
                        </div>
                    )}
                </div>

                {editable && (
                    <div className="absolute bottom-0 right-0">
                        <label
                            htmlFor="single"
                            className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-600 text-white cursor-pointer hover:bg-indigo-700 transition-colors shadow-lg border-2 border-white"
                        >
                            <Upload className="w-5 h-5" />
                        </label>
                        <input
                            style={{
                                visibility: 'hidden',
                                position: 'absolute',
                            }}
                            type="file"
                            id="single"
                            accept="image/*"
                            onChange={uploadAvatar}
                            disabled={uploading}
                        />
                    </div>
                )}
            </div>
            {editable && (
                <p className="text-xs text-gray-500">
                    Recomendado: 400x400px (JPG, PNG)
                </p>
            )}
        </div>
    );
}

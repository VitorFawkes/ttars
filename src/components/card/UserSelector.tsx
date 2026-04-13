import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { User } from 'lucide-react'

interface Profile {
    id: string
    nome: string
    email: string
}

interface UserSelectorProps {
    currentUserId: string | null
    onSelect: (userId: string | null) => void
    label?: string
    disabled?: boolean
    teamIds?: string[] // Filtra por membros desses times
}

export default function UserSelector({ currentUserId, onSelect, label, disabled = false, teamIds }: UserSelectorProps) {
    const [profiles, setProfiles] = useState<Profile[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const fetchProfiles = async () => {
            // teamIds=[] significa "filtro ativo mas sem times" — zero resultados
            if (teamIds !== undefined && teamIds.length === 0) {
                setProfiles([])
                setLoading(false)
                return
            }

            setLoading(true)
            try {
                if (teamIds && teamIds.length > 0) {
                    // Filtro por time via team_members (many-to-many, funciona cross-org)
                    const { data: memberRows, error: memberErr } = await supabase
                        .from('team_members')
                        .select('user_id')
                        .in('team_id', teamIds)
                    if (memberErr) throw memberErr
                    const userIds = Array.from(new Set((memberRows || []).map(r => r.user_id as string)))
                    if (userIds.length === 0) {
                        setProfiles([])
                        return
                    }
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('id, nome, email')
                        .eq('active', true)
                        .in('id', userIds)
                        .order('nome')
                    if (error) throw error
                    setProfiles((data || []) as Profile[])
                } else {
                    // Sem filtro: todos os profiles ativos com vínculo a algum time
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('id, nome, email, team_id')
                        .eq('active', true)
                        .not('team_id', 'is', null)
                        .order('nome')
                    if (error) throw error
                    setProfiles((data || []) as Profile[])
                }
            } catch (error) {
                console.error('Error fetching profiles:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchProfiles()
    }, [teamIds?.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div>
            {label && <label className="text-sm font-medium text-gray-700 mb-1.5 block">{label}</label>}
            <div className="relative">
                <select
                    value={currentUserId || ''}
                    onChange={(e) => onSelect(e.target.value || null)}
                    disabled={disabled || loading}
                    className="w-full appearance-none rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 pl-9 pr-8 cursor-pointer disabled:bg-gray-50 disabled:text-gray-500"
                >
                    <option value="">Sem responsável</option>
                    {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                            {profile.nome || profile.email}
                        </option>
                    ))}
                </select>
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
        </div>
    )
}

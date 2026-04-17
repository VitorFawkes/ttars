import { useAuth } from '../../contexts/AuthContext'
import { LogOut } from 'lucide-react'

export default function Header() {
    const { profile, signOut, user } = useAuth()

    return (
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
            <div className="flex items-center">
                {/* Breadcrumbs or Page Title could go here */}
            </div>
            <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                    <span className="text-sm font-medium text-gray-900">
                        {profile?.nome || user?.email}
                    </span>
                    <span className="text-xs text-gray-500 capitalize">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- role_info join pendente de types regeneration */}
                        {(profile as unknown as Record<string, any>)?.role_info?.display_name || 'Membro'}
                    </span>
                </div>
                <button
                    onClick={() => signOut()}
                    className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    title="Sair"
                >
                    <LogOut className="h-5 w-5" />
                </button>
            </div>
        </header>
    )
}

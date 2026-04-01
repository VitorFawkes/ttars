import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Sidebar from './Sidebar'
import { ThemeBoundary } from "../ui/ThemeBoundary";
import { useProposalNotifications } from '@/hooks/useProposalNotifications';
import { useAssistNotifications } from '@/hooks/useAssistNotifications';

import { usePushNotifications } from '@/hooks/usePushNotifications';
import { GlobalSearchProvider } from '@/components/search/GlobalSearchProvider';
import { GlobalSearchModal } from '@/components/search/GlobalSearchModal';
import { NetworkStatusBanner } from '@/components/ui/NetworkStatusBanner';
import { FeedbackPopup } from '@/components/feedback/FeedbackPopup';
import NotificationCenter from './NotificationCenter';


export default function Layout() {
    const { session, loading, authError } = useAuth()

    // Enable real-time proposal notifications
    useProposalNotifications()
    // Enable real-time notifications for assisted cards
    useAssistNotifications()

    // Enable push notifications (registers SW, checks subscription)
    usePushNotifications()

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
            </div>
        )
    }

    if (authError) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="text-center space-y-4 max-w-sm px-6">
                    <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                    </div>
                    <p className="text-slate-900 font-medium">{authError}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        Tentar novamente
                    </button>
                </div>
            </div>
        )
    }

    if (!session) {
        return <Navigate to="/login" replace />
    }

    return (
        <GlobalSearchProvider>
            <div className="fixed inset-0 flex overflow-hidden">
                <ThemeBoundary mode="dark" className="flex-shrink-0">
                    <Sidebar />
                </ThemeBoundary>

                <ThemeBoundary mode="light" className="flex flex-1 flex-col overflow-hidden relative">
                    <NetworkStatusBanner />
                    <main className="flex-1 relative flex flex-col overflow-hidden bg-surface-secondary">
                        <Outlet />
                    </main>
                </ThemeBoundary>
            </div>
            <GlobalSearchModal />
            <FeedbackPopup />
            <NotificationCenter />
        </GlobalSearchProvider>
    );
}


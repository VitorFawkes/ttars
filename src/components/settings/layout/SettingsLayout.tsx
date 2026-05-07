import { Outlet, useLocation } from 'react-router-dom';
import SettingsSidebar from './SettingsSidebar';
import { cn } from '@/lib/utils';

export default function SettingsLayout() {
    const location = useLocation();
    const isBuilder = location.pathname.includes('/builder')
        || location.pathname.includes('/cadence/')
        || location.pathname.includes('/automations/v2');
    // Editor visual v2 ocupa o espaço inteiro de Configurações — esconde a
    // sidebar interna de Settings pra dar mais canvas. A Sidebar principal
    // do app (Sidebar.tsx) continua visível porque vive fora desse layout.
    const fullscreenBuilder = location.pathname.includes('/automations/v2');

    return (
        <div className="flex w-full h-full bg-muted/30">
            {!fullscreenBuilder && <SettingsSidebar />}
            <div className="flex-1 overflow-auto">
                <div className={cn(isBuilder ? "h-full" : "p-8 max-w-7xl mx-auto")}>
                    <Outlet />
                </div>
            </div>
        </div>
    );
}

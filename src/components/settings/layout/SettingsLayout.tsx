import { Outlet, useLocation } from 'react-router-dom';
import SettingsSidebar from './SettingsSidebar';
import { cn } from '@/lib/utils';

export default function SettingsLayout() {
    const location = useLocation();
    const isBuilder = location.pathname.includes('/builder') || location.pathname.includes('/cadence/');

    return (
        <div className="flex w-full h-full bg-muted/30">
            <SettingsSidebar />
            <div className={cn("flex-1", isBuilder ? "overflow-hidden" : "overflow-auto")}>
                <div className={cn(isBuilder ? "h-full" : "p-8 max-w-7xl mx-auto")}>
                    <Outlet />
                </div>
            </div>
        </div>
    );
}

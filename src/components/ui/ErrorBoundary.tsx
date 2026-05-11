import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Sentry } from '../../lib/sentry';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        Sentry.withScope((scope) => {
            scope.setTag('source', 'ErrorBoundary');
            scope.setContext('react', { componentStack: errorInfo.componentStack });
            Sentry.captureException(error);
        });
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center bg-gray-50">
                    <div className="rounded-full bg-red-100 p-4">
                        <AlertTriangle className="h-8 w-8 text-red-600" />
                    </div>
                    <div className="max-w-md">
                        <h3 className="text-lg font-semibold text-gray-900">Algo deu errado</h3>
                        <p className="text-sm text-gray-500 mt-2">
                            Ocorreu um erro inesperado ao carregar esta página.
                            Tente recarregar ou limpar os filtros.
                        </p>
                        {this.state.error && (
                            <pre className="mt-4 p-2 bg-gray-100 rounded text-xs text-left overflow-auto max-h-32 text-gray-700 border border-gray-200">
                                {this.state.error.message}
                            </pre>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={() => window.location.reload()}
                            variant="outline"
                        >
                            Recarregar Página
                        </Button>
                        <Button
                            onClick={() => {
                                localStorage.removeItem('pipeline-filters');
                                window.location.reload();
                            }}
                            variant="default"
                        >
                            Limpar Cache e Recarregar
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

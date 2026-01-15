import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8 text-center">
            <div className="flex justify-center">
              <div className="h-24 w-24 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-12 w-12 text-red-600" />
              </div>
            </div>
            <div>
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                Ups, da ist etwas schiefgelaufen
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Es tut uns leid, aber ein unerwarteter Fehler ist aufgetreten.
                Unser Team wurde benachrichtigt.
              </p>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mt-4 p-4 bg-gray-100 rounded text-left overflow-auto max-h-48 text-xs text-red-800 font-mono">
                  {this.state.error.toString()}
                </div>
              )}
            </div>
            <div className="mt-5 sm:mt-8 flex justify-center">
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg transition-colors duration-200"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                Seite neu laden
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

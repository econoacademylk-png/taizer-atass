import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

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
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-[#07090b] text-red-500 font-sans p-8">
          <AlertTriangle size={64} className="mb-4 text-red-500 opacity-80" />
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-red-400 opacity-80 max-w-lg text-center mb-6">
            {this.state.error?.message || "An unexpected error occurred in the chart view."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors"
          >
            <RefreshCcw size={16} />
            <span>Reload Application</span>
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

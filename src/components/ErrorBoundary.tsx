import { Component, ErrorInfo, ReactNode } from "react";
import { ShieldAlert, RotateCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-white">
          <div className="max-w-md w-full bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-2xl text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <ShieldAlert className="w-32 h-32 text-rose-500" />
            </div>
            <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-6 relative z-10 animate-bounce" />
            <h2 className="text-2xl font-black mb-2 relative z-10">System Error</h2>
            <p className="text-slate-400 mb-8 relative z-10">
              An unexpected error occurred in the application interface.
            </p>
            <div className="bg-slate-900 rounded-xl p-4 mb-8 text-left overflow-x-auto border border-slate-700">
                <code className="text-rose-400 text-xs font-mono">
                    {this.state.error?.message || "Unknown Error"}
                </code>
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/'; // Hard reload to clear bad state
              }}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 relative z-10"
            >
              <RotateCcw className="w-5 h-5" /> Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

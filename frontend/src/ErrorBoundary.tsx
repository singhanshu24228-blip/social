import React from 'react';

type State = { hasError: boolean; error?: Error; info?: any };

export default class ErrorBoundary extends React.Component<{}, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('ErrorBoundary caught an error:', error, info);
    try {
      this.setState({ hasError: true, error, info });
    } catch (e) {
      // ignore
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-red-600">
          <strong>Something went wrong.</strong>
          <div className="text-sm">Check the browser console for details.</div>
          {this.state.error && (
            <div className="mt-2 p-2 bg-white text-black rounded border">
              <div className="font-semibold">{this.state.error.message}</div>
              {this.state.info?.componentStack && (
                <pre className="text-xs mt-2 whitespace-pre-wrap">{this.state.info.componentStack}</pre>
              )}
              {this.state.error.stack && (
                <pre className="text-xs mt-2 whitespace-pre-wrap">{this.state.error.stack}</pre>
              )}
              <div className="mt-2 flex space-x-2">
                <button onClick={() => window.location.reload()} className="px-2 py-1 bg-blue-600 text-white rounded">Reload</button>
                <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="px-2 py-1 bg-gray-200 rounded">Clear storage & Reload</button>
              </div>
            </div>
          )}
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}

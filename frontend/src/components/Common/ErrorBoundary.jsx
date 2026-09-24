import React from 'react';

/**
 * Last line of defence. Without it, a bad localStorage entry or an unexpected
 * render error produced a blank white screen with nothing in the console.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
  }

  handleReset = () => {
    // Corrupted persisted state is the most common cause -- clear it.
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.setState({ error: null });
    window.location.assign('/');
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          <p className="text-gray-600 text-sm mb-6 break-words">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button
            onClick={this.handleReset}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Reset app
          </button>
        </div>
      </div>
    );
  }
}

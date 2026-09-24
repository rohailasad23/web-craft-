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
      <div className="min-h-screen flex items-center justify-center bg-ink-50 px-4">
        <div className="ui-card animate-pop-in max-w-md w-full p-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-3xl animate-wiggle">
            ⚠️
          </div>
          <h1 className="ui-title mt-5 text-xl">Something went wrong</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500 break-words">
            The app hit an unexpected error. Resetting clears the saved session, which fixes this
            in most cases.
          </p>
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-left font-mono text-xs text-red-700 break-words">
            {String(this.state.error?.message || this.state.error)}
          </div>
          <button onClick={this.handleReset} className="ui-btn ui-btn--primary ui-btn--block mt-6">
            Reset app
          </button>
        </div>
      </div>
    );
  }
}

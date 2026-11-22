'use client';
import { Component } from 'react';

// Catches a render error inside one panel (a drawer, a list) so the rest of the page keeps working.
// Shows a short message and a retry button. Errors are logged to the console for support.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
    this.retry = () => this.setState({ failed: false });
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Panel error:', error, info && info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="card" style={{ margin: 12 }}>
        <b>This panel could not load.</b>
        <div className="muted small" style={{ marginTop: 6 }}>The rest of the tracker still works. Try again, or refresh the page.</div>
        <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={this.retry}>Try again</button>
      </div>
    );
  }
}

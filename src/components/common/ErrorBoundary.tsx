import React from 'react';
import i18n from '../../i18n';
import { AppError, getErrorMessage, normalizeError } from '../../errors';

type Props = {
  children: React.ReactNode;
};

type State = {
  error: AppError | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    error: null,
  };

  static getDerivedStateFromError(error: unknown) {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Unhandled error:', error, info);
  }

  componentDidMount() {
    window.addEventListener('unhandledrejection', this.handleRejection);
    window.addEventListener('error', this.handleWindowError);
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handleRejection);
    window.removeEventListener('error', this.handleWindowError);
  }

  handleRejection = (event: PromiseRejectionEvent) => {
    this.setState({ error: normalizeError(event.reason) });
  };

  handleWindowError = (event: ErrorEvent) => {
    this.setState({ error: normalizeError(event.error || event.message) });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const details = getErrorMessage(error);

    return (
      <div className="empty-state">
        <h3>{i18n.t('errorBoundary.title')}</h3>
        <p>{i18n.t('errorBoundary.message')}</p>
        {details && (
          <div className="error-message">
            {i18n.t('errorBoundary.details', { error: details })}
          </div>
        )}
        <button onClick={this.handleReload}>{i18n.t('errorBoundary.reload')}</button>
      </div>
    );
  }
}

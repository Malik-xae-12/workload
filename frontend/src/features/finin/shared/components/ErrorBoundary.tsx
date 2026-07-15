import React, { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("MAPPING CRASH:", error);
    console.error("Component stack:", errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    const { children, fallback } = this.props;
    const { hasError, error, errorInfo } = this.state;

    if (!hasError) {
      return children;
    }

    if (fallback) {
      return fallback;
    }

    return (
      <div
        style={{
          padding: "24px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: "8px",
          color: "#991b1b",
        }}
      >
        <h2 style={{ margin: "0 0 12px 0", fontSize: "18px" }}>
          💥 Something went wrong
        </h2>

        <div
          style={{
            background: "#fff",
            padding: "16px",
            borderRadius: "6px",
            border: "1px solid #fecaca",
            marginBottom: "16px",
            overflow: "auto",
          }}
        >
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, fontSize: "14px" }}>
            Error:
          </p>
          <pre
            style={{
              margin: 0,
              fontSize: "13px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "#7f1d1d",
            }}
          >
            {error?.toString()}
          </pre>

          {errorInfo && (
            <>
              <p
                style={{
                  margin: "16px 0 8px 0",
                  fontWeight: 600,
                  fontSize: "14px",
                }}
              >
                Component Stack:
              </p>
              <pre
                style={{
                  margin: 0,
                  fontSize: "12px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "#991b1b",
                  opacity: 0.8,
                }}
              >
                {errorInfo.componentStack}
              </pre>
            </>
          )}
        </div>

        <button
          onClick={this.handleReset}
          style={{
            padding: "8px 16px",
            background: "#dc2626",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          Try Again
        </button>
      </div>
    );
  }
}
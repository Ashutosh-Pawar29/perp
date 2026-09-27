import React, { Component, ErrorInfo, ReactNode } from "react";

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
    console.error("[ErrorBoundary] Uncaught application error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0b0e14",
            color: "#e2e8f0",
            fontFamily: "Inter, -apple-system, sans-serif",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              background: "#151923",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "12px",
              padding: "32px",
              maxWidth: "600px",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div style={{ fontSize: "36px", marginBottom: "16px" }}>⚠️</div>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 600,
                color: "#f87171",
                marginBottom: "8px",
              }}
            >
              Application Render Error
            </h2>
            <p
              style={{
                color: "#94a3b8",
                fontSize: "14px",
                marginBottom: "16px",
                lineHeight: "1.5",
              }}
            >
              An unexpected error occurred while rendering the trading interface.
            </p>
            {this.state.error && (
              <pre
                style={{
                  background: "#080b10",
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#fca5a5",
                  overflowX: "auto",
                  textAlign: "left",
                  marginBottom: "20px",
                }}
              >
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

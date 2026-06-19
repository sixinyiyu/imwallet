import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { View, Text, StyleSheet, ScrollView, Platform } from "react-native";
import { RootStack } from "./src/navigation/RootStack";

// ─── Global error handlers: capture uncaught JS errors before they crash the app ───

// Store the last error for display
let lastGlobalError: { message: string; stack?: string } | null = null;

if (Platform.OS !== "web") {
  // Capture unhandled promise rejections
  const g = global as any;
  const originalHandler = g.ErrorUtils?.getGlobalHandler?.();
  if (g.ErrorUtils) {
    g.ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      lastGlobalError = {
        message: error?.message || String(error),
        stack: error?.stack,
      };
      console.error("🔴 [GlobalErrorHandler]", isFatal ? "FATAL" : "ERROR", error?.message, error?.stack);
      // Call original handler to maintain default behavior
      if (originalHandler) {
        originalHandler(error, isFatal);
      }
    });
  }
}

// ─── ErrorBoundary: catch JS errors that would crash the native app ───

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorStack: string | null;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null, errorStack: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorStack: error?.stack || null,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("🔴 [ErrorBoundary]", error?.message, error?.stack, info?.componentStack);
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null, errorStack: null });
  };

  render() {
    if (this.state.hasError) {
      const errorInfo = this.state.errorStack || lastGlobalError?.stack || "";
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>应用出现异常</Text>
          <Text style={errorStyles.message}>
            {this.state.error?.message || lastGlobalError?.message || "未知错误"}
          </Text>
          {errorInfo ? (
            <ScrollView style={errorStyles.stackScroll} contentContainerStyle={errorStyles.stackContent}>
              <Text style={errorStyles.stackText}>{errorInfo}</Text>
            </ScrollView>
          ) : null}
          <Text
            style={errorStyles.restart}
            onPress={this.handleRestart}
          >
            点击重试
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A1628",
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: "#EF4444",
    textAlign: "center",
    marginBottom: 16,
  },
  stackScroll: {
    maxHeight: 300,
    width: "100%",
    marginBottom: 24,
  },
  stackContent: {
    padding: 12,
  },
  stackText: {
    fontSize: 11,
    color: "#9CA3AF",
    fontFamily: "monospace",
    lineHeight: 16,
  },
  restart: {
    fontSize: 16,
    color: "#287220",
    fontWeight: "600",
  },
});

// ─── App Component ───

export default function App() {
  // Web端：禁止页面滚动和左右滑动
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = "AquaD";
      const style = document.createElement("style");
      style.textContent = `
        html, body, #root {
          overflow: hidden !important;
          height: 100vh !important;
          width: 100vw !important;
          position: fixed !important;
          touch-action: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="auto" />
          <RootStack />
        </NavigationContainer>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
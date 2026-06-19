import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from "react-native";

interface AlertOptions {
  title: string;
  message?: string;
  buttons?: Array<{
    text: string;
    style?: "default" | "cancel" | "destructive";
    onPress?: () => void | Promise<void>;
  }>;
}

interface AlertState {
  visible: boolean;
  options: AlertOptions;
  resolving: boolean;
}

const AlertContext = createContext<{
  showAlert: (options: AlertOptions) => void;
}>({ showAlert: () => {} });

export const useAppAlert = () => useContext(AlertContext);

/**
 * Cross-platform Alert provider.
 * On native, could use Alert.alert; on web, uses a Modal.
 * Currently always uses Modal for consistency.
 */
export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AlertState>({
    visible: false,
    options: { title: "", message: "", buttons: [] },
    resolving: false,
  });
  const queueRef = useRef<AlertOptions[]>([]);
  const showingRef = useRef(false);

  const processQueue = useCallback(() => {
    if (showingRef.current || queueRef.current.length === 0) return;
    showingRef.current = true;
    const next = queueRef.current.shift()!;
    setState({ visible: true, options: next, resolving: false });
  }, []);

  const showAlert = useCallback((options: AlertOptions) => {
    queueRef.current.push(options);
    processQueue();
  }, [processQueue]);

  const handlePress = useCallback(async (button: NonNullable<AlertOptions["buttons"]>[number]) => {
    setState(prev => ({ ...prev, resolving: true }));
    try {
      await button.onPress?.();
    } catch {
      // silent
    }
    setState({ visible: false, options: { title: "", message: "", buttons: [] }, resolving: false });
    showingRef.current = false;
    // Process next in queue
    setTimeout(processQueue, 100);
  }, [processQueue]);

  const { visible, options, resolving } = state;
  const buttons = options.buttons || [{ text: "确定", style: "default" }];

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {
        if (!resolving) {
          const cancelBtn = buttons.find(b => b.style === "cancel");
          if (cancelBtn) handlePress(cancelBtn);
        }
      }}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.title}>{options.title}</Text>
            {options.message ? <Text style={styles.message}>{options.message}</Text> : null}
            <View style={styles.buttonRow}>
              {buttons.map((btn, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.button,
                    btn.style === "destructive" && styles.buttonDestructive,
                    btn.style === "cancel" && styles.buttonCancel,
                    resolving && styles.buttonDisabled,
                    buttons.length === 1 && styles.buttonSingle,
                  ]}
                  onPress={() => handlePress(btn)}
                  disabled={resolving}
                  activeOpacity={0.7}
                >
                  {resolving ? (
                    <ActivityIndicator size="small" color={btn.style === "destructive" ? "#fff" : "#6B7280"} />
                  ) : (
                    <Text style={[
                      styles.buttonText,
                      btn.style === "destructive" && styles.buttonTextDestructive,
                      btn.style === "cancel" && styles.buttonTextCancel,
                    ]}>{btn.text}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </AlertContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 400,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#287220",
    alignItems: "center",
  },
  buttonSingle: {
    flex: undefined,
    paddingHorizontal: 48,
  },
  buttonDestructive: {
    backgroundColor: "#EF4444",
  },
  buttonCancel: {
    backgroundColor: "#F3F4F6",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
  },
  buttonTextDestructive: {
    color: "#FFFFFF",
  },
  buttonTextCancel: {
    color: "#6B7280",
  },
});
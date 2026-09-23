import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
} from "react"
import {
  View,
  Text,
  Animated,
  StyleSheet,
  TouchableOpacity,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  X,
} from "lucide-react-native"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export type ToastType = "success" | "error" | "info" | "warning"

export interface ToastOptions {
  title: string
  message?: string
  type?: ToastType
  duration?: number
}

interface ToastContextType {
  show: (options: ToastOptions) => void
  hide: () => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState<ToastOptions | null>(null)
  const translateY = useRef(new Animated.Value(-120)).current
  const opacity = useRef(new Animated.Value(0)).current
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToast(null)
    })
  }, [opacity, translateY])

  const show = useCallback(
    (options: ToastOptions) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setToast(options)

      const type = options.type || "info"
      if (type === "success") haptics.success()
      else if (type === "error") haptics.error()
      else if (type === "warning") haptics.warning()
      else haptics.light()

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: insets.top + 8,
          damping: 18,
          stiffness: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()

      timerRef.current = setTimeout(() => {
        hide()
      }, options.duration || 3500)
    },
    [hide, insets.top, opacity, translateY]
  )

  const renderIcon = (type: ToastType = "info") => {
    switch (type) {
      case "success":
        return <CheckCircle2 size={20} color={theme.colors.success} />
      case "error":
        return <AlertCircle size={20} color={theme.colors.destructive} />
      case "warning":
        return <AlertTriangle size={20} color={theme.colors.warning} />
      default:
        return <Info size={20} color={theme.colors.info} />
    }
  }

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      {toast && (
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ translateY }],
              opacity,
            },
          ]}
        >
          <View style={styles.toastCard}>
            <View style={styles.iconContainer}>{renderIcon(toast.type)}</View>
            <View style={styles.textContainer}>
              <Text style={styles.title}>{toast.title}</Text>
              {toast.message ? (
                <Text style={styles.message}>{toast.message}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={hide}
              style={styles.closeBtn}
            >
              <X size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  toastCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.md,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    ...theme.shadows.md,
  },
  iconContainer: {
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  message: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  },
})

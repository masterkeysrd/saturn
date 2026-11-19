import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Keyboard,
  type LayoutChangeEvent,
} from "react-native"
import BottomSheet, {
  BottomSheetBackdrop,
  TouchableOpacity,
  type BottomSheetProps,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet"
import { X } from "lucide-react-native"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export interface AppBottomSheetProps extends Partial<BottomSheetProps> {
  title?: string
  snapPoints?: (string | number)[]
  onClose?: () => void
  children?: React.ReactNode
}

export function BottomSheetHeader({
  title,
  onClose,
}: {
  title: string
  onClose?: () => void
}) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {onClose && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            haptics.light()
            onClose()
          }}
          style={styles.closeBtn}
        >
          <X size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  )
}

export const AppBottomSheet = forwardRef<BottomSheet, AppBottomSheetProps>(
  (
    {
      title,
      snapPoints: customSnapPoints,
      onClose,
      children,
      enablePanDownToClose = true,
      android_keyboardInputMode = "adjustPan",
      keyboardBehavior = "interactive",
      keyboardBlurBehavior = "none",
      ...props
    },
    ref
  ) => {
    const { colors, isDark } = useTheme()
    const styles = useThemedStyles(createStyles)

    const snapPoints = useMemo(
      () => customSnapPoints || ["40%", "75%"],
      [customSnapPoints]
    )

    const isKeyboardVisibleRef = useRef(false)
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
    const [baseContainerHeight, setBaseContainerHeight] = useState<
      number | undefined
    >(undefined)

    useEffect(() => {
      if (Platform.OS !== "android") return

      const showSub = Keyboard.addListener("keyboardDidShow", () => {
        isKeyboardVisibleRef.current = true
        setIsKeyboardVisible(true)
      })
      const hideSub = Keyboard.addListener("keyboardDidHide", () => {
        isKeyboardVisibleRef.current = false
        setIsKeyboardVisible(false)
      })

      return () => {
        showSub.remove()
        hideSub.remove()
      }
    }, [])

    const handleWrapperLayout = useCallback((event: LayoutChangeEvent) => {
      if (Platform.OS !== "android" || isKeyboardVisibleRef.current) return
      const nextHeight = event.nativeEvent.layout.height
      if (nextHeight > 0) {
        setBaseContainerHeight((prev) =>
          prev === undefined || Math.abs(prev - nextHeight) > 1
            ? nextHeight
            : prev
        )
      }
    }, [])

    const renderBackdrop = useCallback(
      (backdropProps: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...backdropProps}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={isDark ? 0.65 : 0.4}
          pressBehavior="close"
        />
      ),
      [isDark]
    )

    const sheetElement = (
      <BottomSheet
        ref={ref}
        index={-1}
        enableDynamicSizing={props.enableDynamicSizing ?? false}
        snapPoints={snapPoints}
        enablePanDownToClose={enablePanDownToClose}
        android_keyboardInputMode={android_keyboardInputMode}
        keyboardBehavior={keyboardBehavior}
        keyboardBlurBehavior={keyboardBlurBehavior}
        backdropComponent={renderBackdrop}
        backgroundStyle={[
          styles.background,
          { backgroundColor: colors.surface },
        ]}
        handleIndicatorStyle={[
          styles.handleIndicator,
          { backgroundColor: colors.borderStrong },
        ]}
        {...props}
        onChange={(index, position, type) => {
          if (index >= 0) haptics.light()
          if (index === -1) onClose?.()
          props.onChange?.(index, position, type)
        }}
      >
        {title ? (
          <View style={styles.headerWrapper}>
            <BottomSheetHeader title={title} onClose={onClose} />
          </View>
        ) : null}
        {children}
      </BottomSheet>
    )

    if (Platform.OS === "android") {
      return (
        <View
          pointerEvents="box-none"
          onLayout={handleWrapperLayout}
          style={[
            StyleSheet.absoluteFill,
            isKeyboardVisible && baseContainerHeight
              ? { height: baseContainerHeight, bottom: undefined }
              : null,
          ]}
        >
          {sheetElement}
        </View>
      )
    }

    return sheetElement
  }
)

AppBottomSheet.displayName = "AppBottomSheet"

const createStyles = (t: SaturnMobileTheme) => ({
  background: {
    backgroundColor: t.colors.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.borderStrong,
    borderTopLeftRadius: t.radius.xl,
    borderTopRightRadius: t.radius.xl,
  },
  handleIndicator: {
    backgroundColor: t.colors.borderStrong,
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  headerWrapper: {
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingBottom: 12,
    paddingTop: 2,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  closeBtn: {
    padding: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
  },
})

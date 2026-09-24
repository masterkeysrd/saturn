import React, { forwardRef, useCallback, useMemo } from "react"
import { View, Text, StyleSheet } from "react-native"
import BottomSheet, {
  BottomSheetBackdrop,
  TouchableOpacity,
  type BottomSheetProps,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet"
import { X } from "lucide-react-native"
import { theme } from "@/lib/theme"
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
          <X size={18} color={theme.colors.textMuted} />
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
      ...props
    },
    ref
  ) => {
    const snapPoints = useMemo(
      () => customSnapPoints || ["40%", "75%"],
      [customSnapPoints]
    )

    const renderBackdrop = useCallback(
      (backdropProps: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...backdropProps}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.65}
          pressBehavior="close"
        />
      ),
      []
    )

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        enableDynamicSizing={props.enableDynamicSizing ?? false}
        snapPoints={snapPoints}
        enablePanDownToClose={enablePanDownToClose}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handleIndicator}
        onChange={(index) => {
          if (index >= 0) haptics.light()
          if (index === -1) onClose?.()
        }}
        {...props}
      >
        {title ? (
          <View style={styles.headerWrapper}>
            <BottomSheetHeader title={title} onClose={onClose} />
          </View>
        ) : null}
        {children}
      </BottomSheet>
    )
  }
)

AppBottomSheet.displayName = "AppBottomSheet"

const styles = StyleSheet.create({
  background: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderStrong,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
  },
  handleIndicator: {
    backgroundColor: "#475569",
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  headerWrapper: {
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingTop: 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    padding: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
  },
})

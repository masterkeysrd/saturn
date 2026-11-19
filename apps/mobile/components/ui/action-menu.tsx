import { useState, type ComponentType } from "react"
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { MenuAction, MenuComponentProps } from "@expo/ui/community/menu"
import { useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

function canRenderNativeMenuView(): boolean {
  const expoGlobal = (
    globalThis as {
      expo?: {
        getViewConfig?: (moduleName: string, viewName?: string) => unknown
      }
    }
  ).expo
  if (Platform.OS === "ios") {
    return Boolean(
      expoGlobal?.getViewConfig?.("ExpoUI", "HostView") ||
      expoGlobal?.getViewConfig?.("ExpoUI", "MenuView") ||
      expoGlobal?.getViewConfig?.("ExpoUI", "ContextMenu") ||
      expoGlobal?.getViewConfig?.("ExpoUI")
    )
  }
  if (Platform.OS !== "android") return false
  return Boolean(
    expoGlobal?.getViewConfig?.("ExpoUI", "DropdownMenuPopupView") &&
    expoGlobal?.getViewConfig?.("ExpoUI", "DropdownMenuGroupView")
  )
}

function getNativeMenuView(): ComponentType<MenuComponentProps> | null {
  if (!canRenderNativeMenuView()) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@expo/ui/community/menu") as {
      MenuView?: ComponentType<MenuComponentProps>
    }
    return mod.MenuView ?? null
  } catch {
    return null
  }
}

const NativeMenuView = getNativeMenuView()

function flattenActions(actions: MenuAction[]): MenuAction[] {
  const result: MenuAction[] = []
  for (const action of actions) {
    if (action.attributes?.hidden) continue
    if (action.subactions && action.subactions.length > 0) {
      result.push(...flattenActions(action.subactions))
    } else {
      result.push(action)
    }
  }
  return result
}

export function ActionMenu({
  title,
  actions,
  onPressAction,
  style,
  children,
  ...rest
}: MenuComponentProps) {
  const styles = useThemedStyles(createStyles)
  const [sheetVisible, setSheetVisible] = useState(false)
  const insets = useSafeAreaInsets()

  if (NativeMenuView) {
    return (
      <NativeMenuView
        title={title}
        actions={actions}
        onPressAction={onPressAction}
        style={style}
        {...rest}
      >
        {children}
      </NativeMenuView>
    )
  }

  const visibleActions = flattenActions(actions).filter(
    (a) => !a.attributes?.disabled
  )

  const handleFallbackPress = () => {
    if (visibleActions.length === 0) return
    haptics.light()
    setSheetVisible(true)
  }

  const handleSelectAction = (action: MenuAction) => {
    setSheetVisible(false)
    haptics.selection()
    onPressAction?.({
      nativeEvent: { event: action.id ?? action.title },
    })
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handleFallbackPress}
        style={style}
        accessibilityRole="button"
        accessibilityLabel={title || "More actions"}
      >
        {children}
      </TouchableOpacity>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetVisible(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setSheetVisible(false)}
        >
          <Pressable
            style={[
              styles.sheetContainer,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.actionsCard}>
              {title ? (
                <View style={styles.titleRow}>
                  <Text style={styles.titleText}>{title}</Text>
                </View>
              ) : null}

              {visibleActions.map((action, index) => {
                const isDestructive = Boolean(action.attributes?.destructive)
                return (
                  <TouchableOpacity
                    key={action.id ?? `${action.title}-${index}`}
                    activeOpacity={0.7}
                    onPress={() => handleSelectAction(action)}
                    style={[
                      styles.actionRow,
                      (index > 0 || Boolean(title)) && styles.actionRowBorder,
                    ]}
                    testID={`action-menu-item-${action.id ?? action.title}`}
                  >
                    <Text
                      style={[
                        styles.actionText,
                        isDestructive && styles.actionTextDestructive,
                      ]}
                    >
                      {action.title}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSheetVisible(false)}
              style={styles.cancelButton}
              testID="action-menu-cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  backdrop: {
    flex: 1,
    backgroundColor: t.isDark
      ? "rgba(0, 0, 0, 0.55)"
      : "rgba(15, 23, 42, 0.35)",
    justifyContent: "flex-end" as const,
    paddingHorizontal: 12,
  },
  sheetContainer: {
    gap: 8,
  },
  actionsCard: {
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    overflow: "hidden" as const,
  },
  titleRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center" as const,
  },
  titleText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  actionRow: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  actionRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  actionText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  actionTextDestructive: {
    color: t.colors.destructive,
  },
  cancelButton: {
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingVertical: 15,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
})

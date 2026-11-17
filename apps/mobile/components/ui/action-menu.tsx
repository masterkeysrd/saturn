import type { ComponentType } from "react"
import {
  Alert,
  Platform,
  TouchableOpacity,
  type AlertButton,
} from "react-native"
import type { MenuAction, MenuComponentProps } from "@expo/ui/community/menu"

function canRenderNativeMenuView(): boolean {
  if (Platform.OS === "ios") return true
  if (Platform.OS !== "android") return false
  const expoGlobal = (
    globalThis as {
      expo?: {
        getViewConfig?: (moduleName: string, viewName?: string) => unknown
      }
    }
  ).expo
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

  const handleFallbackPress = () => {
    const visibleActions = flattenActions(actions).filter(
      (a) => !a.attributes?.disabled
    )
    if (visibleActions.length === 0) return

    const buttons: AlertButton[] = visibleActions.map((action) => ({
      text: action.title,
      style: action.attributes?.destructive ? "destructive" : "default",
      onPress: () => {
        onPressAction?.({
          nativeEvent: { event: action.id ?? action.title },
        })
      },
    }))
    buttons.push({ text: "Cancel", style: "cancel" })

    Alert.alert(title || "Actions", undefined, buttons, { cancelable: true })
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handleFallbackPress}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={title || "More actions"}
    >
      {children}
    </TouchableOpacity>
  )
}

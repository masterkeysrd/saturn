import React from "react"
import { Text, type TextProps, Platform } from "react-native"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

interface CustomTextProps extends TextProps {
  color?: string
  align?: "left" | "center" | "right"
  children?: React.ReactNode
}

export function Header1({
  style,
  color,
  align,
  children,
  ...props
}: CustomTextProps) {
  const styles = useThemedStyles(createStyles)
  return (
    <Text
      style={[
        styles.header1,
        color ? { color } : undefined,
        align ? { textAlign: align } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Header2({
  style,
  color,
  align,
  children,
  ...props
}: CustomTextProps) {
  const styles = useThemedStyles(createStyles)
  return (
    <Text
      style={[
        styles.header2,
        color ? { color } : undefined,
        align ? { textAlign: align } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Title({
  style,
  color,
  align,
  children,
  ...props
}: CustomTextProps) {
  const styles = useThemedStyles(createStyles)
  return (
    <Text
      style={[
        styles.title,
        color ? { color } : undefined,
        align ? { textAlign: align } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Subtitle({
  style,
  color,
  align,
  children,
  ...props
}: CustomTextProps) {
  const styles = useThemedStyles(createStyles)
  return (
    <Text
      style={[
        styles.subtitle,
        color ? { color } : undefined,
        align ? { textAlign: align } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Body({
  style,
  color,
  align,
  children,
  ...props
}: CustomTextProps) {
  const styles = useThemedStyles(createStyles)
  return (
    <Text
      style={[
        styles.body,
        color ? { color } : undefined,
        align ? { textAlign: align } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  )
}

export function Caption({
  style,
  color,
  align,
  children,
  ...props
}: CustomTextProps) {
  const styles = useThemedStyles(createStyles)
  return (
    <Text
      style={[
        styles.caption,
        color ? { color } : undefined,
        align ? { textAlign: align } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  )
}

interface MonoAmountProps extends CustomTextProps {
  amount?: number
  colored?: boolean
  size?: "sm" | "md" | "lg" | "xl"
}

export function MonoAmount({
  style,
  color,
  align,
  amount,
  colored = false,
  size = "md",
  children,
  ...props
}: MonoAmountProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

  let resolvedColor = color || colors.textPrimary
  if (colored && amount !== undefined) {
    if (amount > 0) resolvedColor = colors.success
    else if (amount < 0) resolvedColor = colors.destructive
    else resolvedColor = colors.textMuted
  }

  const sizeStyle =
    size === "sm"
      ? styles.monoSm
      : size === "lg"
        ? styles.monoLg
        : size === "xl"
          ? styles.monoXl
          : styles.monoMd

  return (
    <Text
      style={[
        styles.mono,
        sizeStyle,
        { color: resolvedColor },
        align ? { textAlign: align } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  header1: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    letterSpacing: -0.5,
  },
  header2: {
    fontSize: 22,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "400" as const,
    color: t.colors.textMuted,
    lineHeight: 20,
  },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    color: t.colors.textSecondary,
    lineHeight: 22,
  },
  caption: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  mono: {
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    fontWeight: "600" as const,
  },
  monoSm: {
    fontSize: 13,
  },
  monoMd: {
    fontSize: 15,
  },
  monoLg: {
    fontSize: 20,
  },
  monoXl: {
    fontSize: 28,
  },
})

import React, { useMemo, useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { CATEGORICAL_PALETTE } from "@saturn/tokens"
import {
  useTheme,
  useThemedStyles,
  getNativeBudgetColors,
  type SaturnMobileTheme,
  type ThemeMode,
} from "@/lib/theme"
import {
  Body,
  Caption,
  Header2,
  MonoAmount,
  Title,
} from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BaseTextInput } from "@/components/ui/text-input"

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
]

export default function DesignSystemGalleryScreen() {
  const { mode, resolvedMode, setMode, colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [sampleInput, setSampleInput] = useState("Whole Foods Market")

  const semanticSwatches = useMemo(
    () => [
      { label: "Background", hex: colors.background },
      { label: "Surface", hex: colors.surface },
      { label: "Elevated", hex: colors.surfaceElevated },
      { label: "Primary", hex: colors.primary },
      { label: "Secondary", hex: colors.brandSecondary },
      { label: "Success", hex: colors.success },
      { label: "Warning", hex: colors.warning },
      { label: "Destructive", hex: colors.destructive },
    ],
    [colors]
  )

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <Header2 color={colors.textPrimary}>Orbital Precision</Header2>
        <Caption color={colors.textMuted}>
          Active mode: {mode} (resolved: {resolvedMode})
        </Caption>
        <View style={styles.modeRow}>
          {THEME_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={mode === option.value ? "primary" : "outline"}
              onPress={() => setMode(option.value)}
              style={styles.modeButton}
            >
              {option.label}
            </Button>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Title color={colors.textPrimary}>Semantic Tokens</Title>
        <View style={styles.swatchGrid}>
          {semanticSwatches.map((item) => (
            <View key={item.label} style={styles.swatchItem}>
              <View
                style={[styles.swatchColor, { backgroundColor: item.hex }]}
              />
              <Text style={styles.swatchLabel} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Title color={colors.textPrimary}>12-Hue Categorical Palette</Title>
        <View style={styles.categoricalGrid}>
          {CATEGORICAL_PALETTE.map((hue) => {
            const tone = getNativeBudgetColors(hue.value, resolvedMode)
            return (
              <View
                key={hue.value}
                style={[
                  styles.hueChip,
                  { backgroundColor: tone.bg, borderColor: tone.border },
                ]}
              >
                <View style={[styles.hueDot, { backgroundColor: tone.bar }]} />
                <Text style={[styles.hueText, { color: tone.text }]}>
                  {hue.label}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Title color={colors.textPrimary}>Typography &amp; MonoAmount</Title>
        <View style={styles.cardSurface}>
          <Body color={colors.textSecondary}>
            Tabular numerals align balances and ledger rows vertically.
          </Body>
          <View style={styles.amountRow}>
            <Caption color={colors.textMuted}>Net Worth</Caption>
            <MonoAmount size="xl" color={colors.textPrimary}>
              $12,850.40
            </MonoAmount>
          </View>
          <View style={styles.amountRow}>
            <Caption color={colors.textMuted}>Inflow</Caption>
            <MonoAmount size="md" amount={4200} colored>
              +$4,200.00
            </MonoAmount>
          </View>
          <View style={styles.amountRow}>
            <Caption color={colors.textMuted}>Outflow</Caption>
            <MonoAmount size="md" amount={-84.2} colored>
              -$84.20
            </MonoAmount>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Title color={colors.textPrimary}>Buttons &amp; Badges</Title>
        <View style={styles.wrapRow}>
          <Button size="sm" variant="primary">
            Primary
          </Button>
          <Button size="sm" variant="secondary">
            Secondary
          </Button>
          <Button size="sm" variant="outline">
            Outline
          </Button>
          <Button size="sm" variant="destructive">
            Delete
          </Button>
        </View>
        <View style={styles.wrapRow}>
          <Badge variant="primary" label="Active" />
          <Badge variant="success" label="Settled" />
          <Badge variant="warning" label="Pending" />
          <Badge variant="destructive" label="Overdue" />
          <Badge variant="outline" label="Outline" />
        </View>
      </View>

      <View style={styles.section}>
        <Title color={colors.textPrimary}>Card &amp; TextInput</Title>
        <Card style={styles.previewCard}>
          <CardHeader>
            <CardTitle>Quiet Card Container</CardTitle>
          </CardHeader>
          <CardContent style={styles.cardBody}>
            <BaseTextInput
              label="Merchant"
              value={sampleInput}
              onChangeText={setSampleInput}
              placeholder="Enter merchant"
            />
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  )
}

function createStyles(t: SaturnMobileTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.colors.background,
    },
    content: {
      padding: t.spacing.md,
      paddingBottom: t.spacing.xxl,
      gap: t.spacing.lg,
    },
    section: {
      gap: t.spacing.sm,
    },
    modeRow: {
      flexDirection: "row",
      gap: t.spacing.sm,
      marginTop: t.spacing.xs,
    },
    modeButton: {
      flex: 1,
    },
    swatchGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: t.spacing.sm,
    },
    swatchItem: {
      width: "22%",
      backgroundColor: t.colors.surface,
      borderColor: t.colors.border,
      borderWidth: 1,
      borderRadius: t.radius.md,
      padding: 6,
      gap: 4,
    },
    swatchColor: {
      height: 28,
      borderRadius: t.radius.sm,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    swatchLabel: {
      fontSize: 11,
      fontWeight: "500",
      color: t.colors.textSecondary,
    },
    categoricalGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: t.spacing.sm,
    },
    hueChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: t.radius.sm,
      borderWidth: 1,
    },
    hueDot: {
      width: 8,
      height: 8,
      borderRadius: 9999,
    },
    hueText: {
      fontSize: 12,
      fontWeight: "600",
    },
    cardSurface: {
      backgroundColor: t.colors.surface,
      borderColor: t.colors.border,
      borderWidth: 1,
      borderRadius: t.radius.md,
      padding: t.spacing.md,
      gap: t.spacing.sm,
    },
    amountRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
    },
    wrapRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: t.spacing.sm,
    },
    previewCard: {
      backgroundColor: t.colors.surface,
      borderColor: t.colors.border,
    },
    cardBody: {
      paddingTop: 4,
    },
  })
}

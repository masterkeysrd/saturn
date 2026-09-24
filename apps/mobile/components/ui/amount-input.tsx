import React from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { Delete } from "lucide-react-native"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { formatCents } from "@saturn/core"

export interface AmountInputProps {
  cents: number
  onChangeCents: (cents: number) => void
  currencySymbol?: string
  currencyCode?: string
  type?: "expense" | "income" | "transfer"
  containerStyle?: StyleProp<ViewStyle>
}

export function AmountInput({
  cents,
  onChangeCents,
  currencySymbol = "$",
  currencyCode = "USD",
  type = "expense",
  containerStyle,
}: AmountInputProps) {
  const handleDigit = (digit: string) => {
    haptics.light()
    const centsStr = cents.toString()
    if (centsStr.length >= 10) return // Limit max digits
    const nextCents = parseInt(cents === 0 ? digit : centsStr + digit, 10)
    onChangeCents(nextCents)
  }

  const handleBackspace = () => {
    haptics.light()
    const centsStr = cents.toString()
    if (centsStr.length <= 1) {
      onChangeCents(0)
    } else {
      onChangeCents(parseInt(centsStr.slice(0, -1), 10))
    }
  }

  const handleQuickAdd = (addCents: number) => {
    haptics.medium()
    onChangeCents(cents + addCents)
  }

  const formattedAmount = (cents / 100).toFixed(2)

  const colorByType =
    type === "income"
      ? theme.colors.success
      : type === "expense"
        ? theme.colors.textPrimary
        : theme.colors.accent

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Display */}
      <View style={styles.displayContainer}>
        <Text
          style={[styles.currencySymbol, { color: colorByType }]}
          numberOfLines={1}
        >
          {currencySymbol}
        </Text>
        <Text style={[styles.amountDisplay, { color: colorByType }]}>
          {formattedAmount}
        </Text>
        {currencyCode && (
          <Text style={styles.currencyCode} numberOfLines={1}>
            {currencyCode}
          </Text>
        )}
      </View>

      {/* Quick Add Chips */}
      <View style={styles.chipsRow}>
        {[1000, 2000, 5000, 10000].map((addAmount) => (
          <TouchableOpacity
            key={addAmount}
            activeOpacity={0.7}
            onPress={() => handleQuickAdd(addAmount)}
            style={styles.chip}
          >
            <Text style={styles.chipText}>
              +{currencySymbol}
              {addAmount / 100}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom Numeric Keypad */}
      <View style={styles.keypad}>
        {[
          ["1", "2", "3"],
          ["4", "5", "6"],
          ["7", "8", "9"],
          ["00", "0", "DEL"],
        ].map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keypadRow}>
            {row.map((key) => {
              const isDelete = key === "DEL"
              return (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.6}
                  onPress={() => {
                    if (isDelete) {
                      handleBackspace()
                    } else if (key === "00") {
                      haptics.light()
                      if (cents > 0) onChangeCents(cents * 100)
                    } else {
                      handleDigit(key)
                    }
                  }}
                  style={styles.keypadKey}
                >
                  {isDelete ? (
                    <Delete size={22} color={theme.colors.textMuted} />
                  ) : (
                    <Text style={styles.keyText}>{key}</Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    width: "100%",
    paddingVertical: 12,
  },
  displayContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginBottom: 16,
    gap: 4,
  },
  currencySymbol: {
    fontSize: 28,
    fontWeight: "700",
    flexShrink: 0,
  },
  amountDisplay: {
    fontSize: 44,
    fontWeight: "700",
    letterSpacing: -1,
  },
  currencyCode: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textMuted,
    marginLeft: 6,
    flexShrink: 0,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  keypad: {
    width: "100%",
    maxWidth: 320,
    gap: 8,
  },
  keypadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  keypadKey: {
    flex: 1,
    height: 54,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
})

import React, { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Check, X, DollarSign, Tag, FileText } from "lucide-react-native"
import { transactionSchema } from "@saturn/schemas"
import { formatAmount } from "@saturn/core"
import { theme } from "../../lib/theme"

const QUICK_CATEGORIES = [
  { id: "groceries", name: "Groceries" },
  { id: "dining", name: "Dining" },
  { id: "transport", name: "Transport" },
  { id: "tech", name: "Tech" },
  { id: "health", name: "Health" },
]

export default function AddTransactionModal() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("groceries")
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isExpense, setIsExpense] = useState(true)

  const handleSave = () => {
    // Validate with shared Zod transaction schema
    const result = transactionSchema.safeParse({
      budgetId: selectedCategory,
      description: description || "Expense",
      amount: amount || "0",
      currency: "USD",
      transactionDate: new Date(),
      hasCustomEffectiveDate: false,
      effectiveDate: new Date(),
    })

    if (!result.success) {
      setValidationError(
        result.error.errors[0]?.message || "Invalid transaction"
      )
      return
    }

    // In Task 06 we wire live useCreateTransactionMutation
    router.back()
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom, 20) + 16 },
        ]}
      >
        {/* Type Toggle: Expense vs Income */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, isExpense && styles.toggleExpenseActive]}
            onPress={() => setIsExpense(true)}
          >
            <Text
              style={[
                styles.toggleText,
                isExpense && {
                  color: theme.colors.destructive,
                  fontWeight: "bold",
                },
              ]}
            >
              Expense
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleBtn, !isExpense && styles.toggleIncomeActive]}
            onPress={() => setIsExpense(false)}
          >
            <Text
              style={[
                styles.toggleText,
                !isExpense && {
                  color: theme.colors.success,
                  fontWeight: "bold",
                },
              ]}
            >
              Income
            </Text>
          </TouchableOpacity>
        </View>

        {/* Big Amount Input */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>ENTER AMOUNT (USD)</Text>
          <View style={styles.amountInputRow}>
            <Text style={styles.currencyPrefix}>$</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="numeric"
              value={amount}
              onChangeText={(val) => {
                setAmount(val)
                setValidationError(null)
              }}
              autoFocus
            />
          </View>
        </View>

        {/* Description Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.fieldLabel}>Description / Merchant</Text>
          <View style={styles.fieldWrapper}>
            <FileText
              size={18}
              color={theme.colors.textMuted}
              style={{ marginRight: 10 }}
            />
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g. Whole Foods, Uber, Salary"
              placeholderTextColor={theme.colors.textMuted}
              value={description}
              onChangeText={(val) => {
                setDescription(val)
                setValidationError(null)
              }}
            />
          </View>
        </View>

        {/* Category Pills */}
        <View style={styles.inputGroup}>
          <Text style={styles.fieldLabel}>Category / Budget</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryPills}
          >
            {QUICK_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryPill,
                    isSelected && styles.categoryPillActive,
                  ]}
                  onPress={() => setSelectedCategory(cat.id)}
                >
                  <Tag
                    size={14}
                    color={
                      isSelected
                        ? theme.colors.primaryForeground
                        : theme.colors.textMuted
                    }
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.categoryPillText,
                      isSelected && styles.categoryPillTextActive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        {validationError && (
          <Text style={styles.errorBanner}>{validationError}</Text>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => router.back()}
          >
            <X
              size={18}
              color={theme.colors.textMuted}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Check size={18} color="#090d16" style={{ marginRight: 6 }} />
            <Text style={styles.saveText}>Save Transaction</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: 20,
    gap: 18,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    padding: 4,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.sm,
  },
  toggleExpenseActive: {
    backgroundColor: "rgba(244, 63, 94, 0.15)",
  },
  toggleIncomeActive: {
    backgroundColor: "rgba(52, 211, 153, 0.15)",
  },
  toggleText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  amountCard: {
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  currencyPrefix: {
    fontSize: 32,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
    marginRight: 6,
  },
  amountInput: {
    fontSize: 40,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
    minWidth: 140,
    textAlign: "center",
  },
  inputGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textMuted,
  },
  fieldWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
  },
  fieldInput: {
    flex: 1,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontSize: 15,
  },
  categoryPills: {
    flexDirection: "row",
    gap: 8,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  categoryPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  categoryPillText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  categoryPillTextActive: {
    color: theme.colors.primaryForeground,
    fontWeight: "600",
  },
  errorBanner: {
    color: theme.colors.destructive,
    fontSize: 13,
    textAlign: "center",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  cancelBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 14,
    borderRadius: theme.radius.sm,
  },
  cancelText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.radius.sm,
  },
  saveText: {
    color: theme.colors.primaryForeground,
    fontSize: 14,
    fontWeight: "600",
  },
})

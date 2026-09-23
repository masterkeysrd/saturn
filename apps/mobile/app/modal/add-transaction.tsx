import { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Check, X, Tag, FileText } from "lucide-react-native"
import { transactionSchema } from "@saturn/schemas"
import { theme } from "@/lib/theme"
import { AmountInput } from "@/components/ui/amount-input"
import { TextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"

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
  const toast = useToast()
  const [cents, setCents] = useState(0)
  const [description, setDescription] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("groceries")
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isExpense, setIsExpense] = useState(true)

  const handleSave = () => {
    const amountStr = (cents / 100).toFixed(2)
    const result = transactionSchema.safeParse({
      budgetId: selectedCategory,
      description: description.trim() || (isExpense ? "Expense" : "Income"),
      amount: amountStr,
      currency: "USD",
      transactionDate: new Date(),
      hasCustomEffectiveDate: false,
      effectiveDate: new Date(),
    })

    if (!result.success) {
      const err = result.error.errors[0]?.message || "Invalid transaction"
      setValidationError(err)
      toast.show({
        type: "error",
        title: "Validation Error",
        message: err,
      })
      return
    }

    toast.show({
      type: "success",
      title: "Transaction Created",
      message: `${isExpense ? "Spent" : "Earned"} $${amountStr}`,
    })
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
        keyboardShouldPersistTaps="handled"
      >
        {/* Type Toggle: Expense vs Income */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, isExpense && styles.toggleExpenseActive]}
            onPress={() => setIsExpense(true)}
            activeOpacity={0.7}
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
            activeOpacity={0.7}
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
        <Card style={styles.amountCard}>
          <Text style={styles.amountLabel}>ENTER AMOUNT (USD)</Text>
          <AmountInput
            cents={cents}
            onChangeCents={(val) => {
              setCents(val)
              setValidationError(null)
            }}
            type={isExpense ? "expense" : "income"}
          />
        </Card>

        {/* Description Input */}
        <TextInput
          label="Description / Merchant"
          placeholder="e.g. Whole Foods, Uber, Salary"
          value={description}
          onChangeText={(val) => {
            setDescription(val)
            setValidationError(null)
          }}
          leftIcon={<FileText size={18} color={theme.colors.textMuted} />}
        />

        {/* Category Selector */}
        <View style={styles.categorySection}>
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
                  activeOpacity={0.7}
                  onPress={() => setSelectedCategory(cat.id)}
                >
                  <Badge
                    variant={isSelected ? "primary" : "default"}
                    size="md"
                    label={cat.name}
                    icon={
                      <Tag
                        size={13}
                        color={
                          isSelected
                            ? theme.colors.primary
                            : theme.colors.textMuted
                        }
                      />
                    }
                  />
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
          <Button
            variant="secondary"
            size="lg"
            style={styles.cancelBtn}
            leftIcon={<X size={18} color={theme.colors.textMuted} />}
            onPress={() => router.back()}
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            size="lg"
            style={styles.saveBtn}
            leftIcon={
              <Check size={18} color={theme.colors.primaryForeground} />
            }
            onPress={handleSave}
          >
            Save Transaction
          </Button>
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
    padding: 16,
    gap: 16,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.md,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: theme.radius.sm,
  },
  toggleExpenseActive: {
    backgroundColor: theme.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
  },
  toggleIncomeActive: {
    backgroundColor: theme.colors.successSubtle,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  toggleText: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  amountCard: {
    padding: 16,
    alignItems: "center",
  },
  amountLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  categorySection: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  categoryPills: {
    flexDirection: "row",
    gap: 8,
  },
  errorBanner: {
    backgroundColor: theme.colors.destructiveSubtle,
    color: theme.colors.destructive,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
    padding: 12,
    borderRadius: theme.radius.md,
    fontSize: 13,
    textAlign: "center",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
  },
  saveBtn: {
    flex: 2,
  },
})

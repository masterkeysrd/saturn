import { useState, useEffect, useRef, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Switch,
  Keyboard,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  X,
  Calendar,
  ChevronRight,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Tag,
  Clock,
  Sparkles,
} from "lucide-react-native"
import {
  useCreateRecurringTransactionMutation,
  useUpdateRecurringTransactionMutation,
  useDeleteRecurringTransactionMutation,
  useListRecurringTransactionsQuery,
  useListCurrenciesQuery,
  useListBudgetsQuery,
  useListAccountsQuery,
  useGetFinanceSettingsQuery,
  type RecurringTransaction,
  type RecurringTransaction_Interval,
  type RecurringTransaction_Status,
  type Budget,
  type Account,
  type CurrencyInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { recurringTransactionSchema } from "@saturn/schemas"
import {
  toCentsString,
  formatCents,
  RECURRING_INTERVAL_OPTIONS,
} from "@saturn/core"
import { useCurrencyConversionPreview } from "@saturn/hooks/finance"
import { useSpace } from "@/lib/space-context"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { useToast } from "@/components/ui/toast"
import { getBudgetIcon } from "@/lib/budget-icons"
import {
  DatePickerSheet,
  toLocalISODate,
  formatDisplayDate,
} from "@/components/ui/date-picker-sheet"
import {
  BudgetPickerSheet,
  CurrencyPickerSheet,
  AccountPickerSheet,
} from "@/components/finance/sheets"
import { AccountCardSelect } from "@/components/finance/account-select"
import { invalidateFinanceQueries } from "@/components/finance/finance-utils"

export default function ManageRecurringModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { id: editRecurringId } = useLocalSearchParams<{ id?: string }>()
  const isEditMode = Boolean(editRecurringId)
  const queryClient = useQueryClient()
  const toast = useToast()

  // Sheet references
  const currencySheetRef = useRef<BottomSheet>(null)
  const budgetSheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)
  const dateSheetRef = useRef<BottomSheet>(null)

  // 1. Settings & Base Currency
  const { data: settingsData } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // 2. Fetch Currencies, Budgets, and Accounts
  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: !!activeSpaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies: CurrencyInfo[] = currenciesData?.currencies || []

  const { data: budgetsData, isLoading: isBudgetsLoading } =
    useListBudgetsQuery(
      { pageSize: 100, pageToken: "", view: "FULL" },
      { enabled: !!activeSpaceId }
    )
  const budgets: Budget[] = budgetsData?.budgets || []

  const { data: accountsData } = useListAccountsQuery(
    { activeOnly: true },
    { enabled: !!activeSpaceId }
  )
  const accounts: Account[] = accountsData?.accounts || []

  // 3. Fetch recurring templates if edit mode
  const { data: recurringData, isLoading: isRecurringLoading } =
    useListRecurringTransactionsQuery(
      { pageSize: 100, pageToken: "", status: "STATUS_UNSPECIFIED" },
      { enabled: !!activeSpaceId }
    )
  const existingRecurring = useMemo(() => {
    if (!editRecurringId) return null
    return (
      recurringData?.recurringTransactions?.find(
        (t) => t.id === editRecurringId
      ) || null
    )
  }, [recurringData, editRecurringId])

  // Form State
  const [type, setType] = useState<"EXPENSE" | "INCOME">("EXPENSE")
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState(baseCurrency)
  const [interval, setInterval] =
    useState<RecurringTransaction_Interval>("MONTHLY")
  const [nextDueDate, setNextDueDate] = useState<Date>(new Date())
  const [budgetId, setBudgetId] = useState("")
  const [accountId, setAccountId] = useState("")
  const [isVariable, setIsVariable] = useState(false)
  const [gracePeriodDays, setGracePeriodDays] = useState(3)
  const [status, setStatus] = useState<RecurringTransaction_Status>("ACTIVE")
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Multi-currency preview
  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId: activeSpaceId || undefined,
    enabled: !!activeSpaceId,
    baseCurrency,
  })

  const conversionPreview = useMemo(() => {
    if (!currency || currency === baseCurrency || !amount) return null
    const preview = getConversionPreview(amount, currency)
    if (preview && "amount" in preview && typeof preview.amount === "number") {
      return preview.amount
    }
    return null
  }, [amount, currency, baseCurrency, getConversionPreview])

  // Populate form if editing
  useEffect(() => {
    if (existingRecurring) {
      setType(existingRecurring.type === "INCOME" ? "INCOME" : "EXPENSE")
      setName(existingRecurring.name || "")
      setAmount(formatCents(existingRecurring.amount).toString())
      setCurrency(existingRecurring.currency || baseCurrency)
      setInterval(existingRecurring.interval || "MONTHLY")
      setBudgetId(existingRecurring.budgetId || "")
      setAccountId(existingRecurring.accountId || "")
      setIsVariable(existingRecurring.isVariable || false)
      setGracePeriodDays(existingRecurring.gracePeriodDays ?? 3)
      setStatus(existingRecurring.status || "ACTIVE")

      if (existingRecurring.executionState?.nextDueDate) {
        const d = new Date(existingRecurring.executionState.nextDueDate)
        if (!isNaN(d.getTime())) {
          setNextDueDate(d)
        }
      }
    } else if (!isEditMode) {
      setCurrency(baseCurrency)
      if (budgets.length > 0 && !budgetId) {
        setBudgetId(budgets[0].id || "")
      }
    }
  }, [existingRecurring, baseCurrency, isEditMode, budgets])

  // Mutations
  const createMutation = useCreateRecurringTransactionMutation()
  const updateMutation = useUpdateRecurringTransactionMutation()
  const deleteMutation = useDeleteRecurringTransactionMutation()

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isDeleting = deleteMutation.isPending

  // Selected entities for display
  const selectedBudget = useMemo(
    () => budgets.find((b) => b.id === budgetId),
    [budgets, budgetId]
  )
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  )

  const handleSave = async () => {
    haptics.light()
    setErrors({})

    const validation = recurringTransactionSchema.safeParse({
      type,
      name: name.trim(),
      amount: amount.trim(),
      currency,
      interval,
      nextDueDate,
      budgetId: type === "EXPENSE" ? budgetId || undefined : undefined,
      accountId: accountId || undefined,
      isVariable,
      gracePeriodDays,
      status,
    })

    if (!validation.success) {
      const fieldErrors: Record<string, string> = {}
      validation.error.issues.forEach((err) => {
        const path = err.path[0]?.toString()
        if (path) fieldErrors[path] = err.message
      })
      setErrors(fieldErrors)
      haptics.warning()
      toast.show({
        title: "Validation Error",
        message: validation.error.issues[0]?.message || "Check required fields",
        type: "error",
      })
      return
    }

    try {
      const centsAmount = toCentsString(amount)
      const nextDueDateIso = toLocalISODate(nextDueDate)

      if (isEditMode && editRecurringId) {
        await updateMutation.mutateAsync({
          id: editRecurringId,
          req: {
            id: editRecurringId,
            version: existingRecurring?.version,
            recurringTransaction: {
              ...existingRecurring,
              type,
              name: name.trim(),
              amount: centsAmount,
              currency,
              interval,
              executionState: {
                ...existingRecurring?.executionState,
                nextDueDate: nextDueDateIso,
              },
              budgetId: type === "EXPENSE" ? budgetId : undefined,
              accountId: accountId || undefined,
              isVariable,
              gracePeriodDays,
              status,
            } as RecurringTransaction,
          },
        })
        haptics.success()
        toast.show({
          title: "Template Updated",
          message: `"${name.trim()}" was updated.`,
          type: "success",
        })
      } else {
        await createMutation.mutateAsync({
          recurringTransaction: {
            type,
            name: name.trim(),
            amount: centsAmount,
            currency,
            interval,
            executionState: {
              nextDueDate: nextDueDateIso,
            },
            budgetId: type === "EXPENSE" ? budgetId : undefined,
            accountId: accountId || undefined,
            isVariable,
            gracePeriodDays,
            status: "ACTIVE",
          } as RecurringTransaction,
        })
        haptics.success()
        toast.show({
          title: "Template Created",
          message: `"${name.trim()}" has been set up.`,
          type: "success",
        })
      }

      await invalidateFinanceQueries(queryClient)
      router.back()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: isEditMode ? "Update Failed" : "Create Failed",
        message: err?.message || "Could not save recurring template.",
        type: "error",
      })
    }
  }

  const handleDelete = () => {
    if (!existingRecurring || !editRecurringId) return
    haptics.warning()

    Alert.alert(
      "Delete Recurring Template",
      `Are you sure you want to delete "${name}"? Future scheduled instances will no longer be generated.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                id: editRecurringId,
                req: {
                  id: editRecurringId,
                  version: existingRecurring.version,
                },
              })
              haptics.success()
              toast.show({
                title: "Template Deleted",
                message: `"${name}" was deleted.`,
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              router.back()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: "Delete Failed",
                message: err?.message || "Could not delete template.",
                type: "error",
              })
            }
          },
        },
      ]
    )
  }

  if (isEditMode && isRecurringLoading && !existingRecurring) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: isEditMode ? "Edit Recurring" : "New Recurring",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={[styles.headerSaveBtn, isSaving && { opacity: 0.6 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Text style={styles.headerSaveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type Selector (Expense vs Income) */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                type === "EXPENSE" && styles.segmentBtnActiveExpense,
              ]}
              onPress={() => {
                haptics.selection()
                setType("EXPENSE")
              }}
              activeOpacity={0.8}
            >
              <ArrowUpRight
                size={16}
                color={
                  type === "EXPENSE"
                    ? theme.colors.destructive
                    : theme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.segmentText,
                  type === "EXPENSE" && styles.segmentTextActiveExpense,
                ]}
              >
                Expense / Bill
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentBtn,
                type === "INCOME" && styles.segmentBtnActiveIncome,
              ]}
              onPress={() => {
                haptics.selection()
                setType("INCOME")
              }}
              activeOpacity={0.8}
            >
              <ArrowDownLeft
                size={16}
                color={
                  type === "INCOME"
                    ? theme.colors.success
                    : theme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.segmentText,
                  type === "INCOME" && styles.segmentTextActiveIncome,
                ]}
              >
                Income / Salary
              </Text>
            </TouchableOpacity>
          </View>

          {/* Template Name */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>TEMPLATE NAME *</Text>
            <TextInput
              placeholder={
                type === "EXPENSE"
                  ? "e.g., Netflix, Office Rent, Electricity"
                  : "e.g., Monthly Salary, Client Retainer"
              }
              value={name}
              onChangeText={(val) => {
                setName(val)
                if (errors.name) {
                  setErrors((prev) => ({ ...prev, name: "" }))
                }
              }}
              style={styles.textInput}
            />
            {errors.name ? (
              <Text style={styles.errorText}>{errors.name}</Text>
            ) : null}
          </Card>

          {/* Amount & Currency */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>AMOUNT & CURRENCY *</Text>
            <View style={styles.amountRow}>
              <View style={styles.amountInputWrapper}>
                <TextInput
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={(val) => {
                    setAmount(val)
                    if (errors.amount) {
                      setErrors((prev) => ({ ...prev, amount: "" }))
                    }
                  }}
                  style={styles.amountInput}
                />
              </View>
              <TouchableOpacity
                style={styles.currencyPill}
                onPress={() => {
                  haptics.light()
                  currencySheetRef.current?.expand()
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.currencyPillText}>{currency}</Text>
                <ChevronRight size={14} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {conversionPreview !== null ? (
              <View style={styles.conversionBadge}>
                <Sparkles size={13} color={theme.colors.textSecondary} />
                <Text style={styles.conversionText}>
                  ≈ {conversionPreview.toFixed(2)} {baseCurrency} (Base)
                </Text>
              </View>
            ) : null}

            {errors.amount ? (
              <Text style={styles.errorText}>{errors.amount}</Text>
            ) : null}
          </Card>

          {/* Recurrence Interval */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>FREQUENCY *</Text>
            <View style={styles.frequencyRow}>
              {RECURRING_INTERVAL_OPTIONS.map((opt) => {
                const isSelected = interval === opt.value
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.frequencyChip,
                      isSelected && styles.frequencyChipActive,
                    ]}
                    onPress={() => {
                      haptics.selection()
                      setInterval(opt.value as RecurringTransaction_Interval)
                    }}
                    activeOpacity={0.7}
                  >
                    <Clock
                      size={14}
                      color={
                        isSelected
                          ? theme.colors.primary
                          : theme.colors.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.frequencyChipText,
                        isSelected && styles.frequencyChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </Card>

          {/* Next Due Date / Start Date */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>NEXT DUE DATE *</Text>
            <TouchableOpacity
              style={styles.pickerSelectorRow}
              onPress={() => {
                haptics.light()
                dateSheetRef.current?.expand()
              }}
              activeOpacity={0.7}
            >
              <View style={styles.pickerSelectorLeft}>
                <View style={styles.pickerIconWrapper}>
                  <Calendar size={18} color={theme.colors.primary} />
                </View>
                <View>
                  <Text style={styles.pickerValueText}>
                    {formatDisplayDate(nextDueDate)}
                  </Text>
                  <Text style={styles.pickerHintText}>
                    Target execution schedule
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </Card>

          {/* Budget Category (Required if EXPENSE) */}
          {type === "EXPENSE" ? (
            <Card style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>BUDGET CATEGORY *</Text>
              <TouchableOpacity
                style={styles.pickerSelectorRow}
                onPress={() => {
                  haptics.light()
                  budgetSheetRef.current?.expand()
                }}
                activeOpacity={0.7}
              >
                <View style={styles.pickerSelectorLeft}>
                  {selectedBudget ? (
                    (() => {
                      const colors = getNativeBudgetColors(
                        selectedBudget.color || "indigo"
                      )
                      const IconComp = getBudgetIcon(
                        selectedBudget.icon || "piggy-bank",
                        selectedBudget.name
                      )
                      return (
                        <View
                          style={[
                            styles.budgetIconCircle,
                            { backgroundColor: colors.bg },
                          ]}
                        >
                          <IconComp size={16} color={colors.text} />
                        </View>
                      )
                    })()
                  ) : (
                    <View style={styles.pickerIconWrapper}>
                      <Tag size={18} color={theme.colors.textMuted} />
                    </View>
                  )}
                  <View>
                    <Text
                      style={[
                        styles.pickerValueText,
                        !selectedBudget && { color: theme.colors.textMuted },
                      ]}
                    >
                      {selectedBudget?.name || "Select Budget Category"}
                    </Text>
                    <Text style={styles.pickerHintText}>
                      Tracks spending against allocation
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
              {errors.budgetId ? (
                <Text style={styles.errorText}>{errors.budgetId}</Text>
              ) : null}
            </Card>
          ) : null}

          {/* Account Mapping (Optional) */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              {type === "EXPENSE" ? "PAY FROM ACCOUNT" : "DEPOSIT TO ACCOUNT"}{" "}
              (OPTIONAL)
            </Text>
            <AccountCardSelect
              account={selectedAccount}
              onPress={() => {
                Keyboard.dismiss()
                accountSheetRef.current?.expand()
              }}
              placeholder="None (Choose when confirming)"
              subtitle="Default linked payment method"
            />
          </Card>

          {/* Options: Variable amount & Grace period */}
          <Card style={styles.fieldCard}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleTitle}>Variable Amount</Text>
                <Text style={styles.toggleDescription}>
                  Amount fluctuates each billing cycle (e.g. utility bills)
                </Text>
              </View>
              <Switch
                value={isVariable}
                onValueChange={(val) => {
                  haptics.selection()
                  setIsVariable(val)
                }}
                trackColor={{
                  false: theme.colors.surfaceElevated,
                  true: theme.colors.primary,
                }}
                thumbColor="#ffffff"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleTitle}>Grace Period</Text>
                <Text style={styles.toggleDescription}>
                  Days allowed past due date before marking overdue
                </Text>
              </View>
              <View style={styles.graceChipsRow}>
                {[0, 3, 5, 7].map((days) => {
                  const isSelected = gracePeriodDays === days
                  return (
                    <TouchableOpacity
                      key={days}
                      style={[
                        styles.graceChip,
                        isSelected && styles.graceChipActive,
                      ]}
                      onPress={() => {
                        haptics.selection()
                        setGracePeriodDays(days)
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.graceChipText,
                          isSelected && styles.graceChipTextActive,
                        ]}
                      >
                        {days}d
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          </Card>

          {/* Edit Mode: Status & Delete */}
          {isEditMode ? (
            <Card style={styles.fieldCard}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleTitle}>Template Active</Text>
                  <Text style={styles.toggleDescription}>
                    Paused templates do not generate new scheduled cycles
                  </Text>
                </View>
                <Switch
                  value={status === "ACTIVE"}
                  onValueChange={(active) => {
                    haptics.selection()
                    setStatus(active ? "ACTIVE" : "PAUSED")
                  }}
                  trackColor={{
                    false: theme.colors.surfaceElevated,
                    true: theme.colors.primary,
                  }}
                  thumbColor="#ffffff"
                />
              </View>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDelete}
                disabled={isDeleting}
                activeOpacity={0.7}
              >
                {isDeleting ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.destructive}
                  />
                ) : (
                  <>
                    <Trash2 size={16} color={theme.colors.destructive} />
                    <Text style={styles.deleteBtnText}>
                      Delete Recurring Template
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sheets */}
      <CurrencyPickerSheet
        ref={currencySheetRef}
        currencies={currencies}
        selectedCurrency={currency}
        onSelect={(code) => setCurrency(code)}
      />

      <BudgetPickerSheet
        ref={budgetSheetRef}
        budgets={budgets}
        selectedBudgetId={budgetId}
        isLoading={isBudgetsLoading}
        onSelect={(b) => {
          if (b.id) {
            setBudgetId(b.id)
            if (b.currency) {
              setCurrency(b.currency)
            }
            if (errors.budgetId) {
              setErrors((prev) => ({ ...prev, budgetId: "" }))
            }
          }
        }}
      />

      <DatePickerSheet
        ref={dateSheetRef}
        title="Select Due Date"
        value={nextDueDate}
        onChange={(d) => setNextDueDate(d)}
      />

      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        selectedAccountId={accountId}
        onSelect={(id) => {
          setAccountId(id)
          accountSheetRef.current?.close()
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerSaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  headerSaveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    padding: 4,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    gap: 6,
  },
  segmentBtnActiveExpense: {
    backgroundColor: theme.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
  },
  segmentBtnActiveIncome: {
    backgroundColor: theme.colors.successSubtle,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  segmentTextActiveExpense: {
    color: theme.colors.destructive,
  },
  segmentTextActiveIncome: {
    color: theme.colors.success,
  },
  fieldCard: {
    padding: 16,
    gap: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
  },
  textInput: {
    fontSize: 15,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  amountInputWrapper: {
    flex: 1,
  },
  amountInput: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  currencyPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  currencyPillText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  conversionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
    alignSelf: "flex-start",
  },
  conversionText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  frequencyRow: {
    flexDirection: "row",
    gap: 8,
  },
  frequencyChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  frequencyChipActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
  },
  frequencyChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  frequencyChipTextActive: {
    color: theme.colors.primary,
  },
  pickerSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  pickerSelectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  pickerIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  budgetIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerValueText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  pickerHintText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  toggleDescription: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  graceChipsRow: {
    flexDirection: "row",
    gap: 6,
  },
  graceChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  graceChipActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
  },
  graceChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  graceChipTextActive: {
    color: theme.colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 8,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.destructive,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
    marginTop: -4,
  },
})

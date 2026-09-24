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
  Keyboard,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import { X, Check, ChevronDown, Trash2 } from "lucide-react-native"
import {
  useCreateBudgetMutation,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
  useGetBudgetQuery,
  useListCurrenciesQuery,
  useListAccountsQuery,
  useListInstitutionsQuery,
  useGetFinanceSettingsQuery,
  type Budget,
  type Budget_RecurrenceInterval,
  type CurrencyInfo,
  type Account,
  type Account_InstitutionInfo,
  type LimitPropagation,
} from "@saturn/api/saturn/finance/v1/finance"
import { budgetSchema } from "@saturn/schemas"
import {
  toCentsString,
  formatCents,
  getCurrencySymbol,
  AVAILABLE_COLORS,
  BUDGET_INTERVAL_OPTIONS as INTERVAL_OPTIONS,
  PROPAGATION_OPTIONS,
} from "@saturn/core"
import { useSpace } from "@/lib/space-context"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { BUDGET_ICONS, getBudgetIcon } from "@/lib/budget-icons"
import {
  CurrencyPickerSheet,
  AccountPickerSheet,
} from "@/components/finance/sheets"
import { AccountCardSelect } from "@/components/finance/account-select"
import { invalidateFinanceQueries } from "@/components/finance/finance-utils"

export default function ManageBudgetModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { id: editBudgetId } = useLocalSearchParams<{ id?: string }>()
  const isEditMode = Boolean(editBudgetId)
  const queryClient = useQueryClient()
  const toast = useToast()

  // Bottom sheets
  const currencySheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)

  // Fetch settings & base currency
  const { data: settingsData } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // Fetch currencies & accounts
  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: !!activeSpaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies: CurrencyInfo[] = currenciesData?.currencies || []

  const { data: accountsData } = useListAccountsQuery(
    { activeOnly: true },
    { enabled: !!activeSpaceId }
  )
  const accounts: Account[] = accountsData?.accounts || []

  // Fetch institutions
  const { data: instData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const institutions: Account_InstitutionInfo[] = instData?.institutions || []

  // Fetch existing budget if edit mode
  const { data: existingBudget, isLoading: isBudgetLoading } =
    useGetBudgetQuery(
      { id: editBudgetId || "" },
      { enabled: isEditMode && !!editBudgetId && !!activeSpaceId }
    )

  // Form State
  const [name, setName] = useState("")
  const [limit, setLimit] = useState("")
  const [currency, setCurrency] = useState(baseCurrency)
  const [interval, setInterval] = useState<Budget_RecurrenceInterval>("MONTHLY")
  const [color, setColor] = useState("indigo")
  const [icon, setIcon] = useState("piggy-bank")
  const [defaultAccountId, setDefaultAccountId] = useState("")
  const [propagation, setPropagation] = useState<LimitPropagation>(
    "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY"
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Initialize values when existing budget is loaded
  useEffect(() => {
    if (existingBudget) {
      setName(existingBudget.name || "")
      setLimit(formatCents(existingBudget.limitAmount || "0").toString())
      setCurrency(existingBudget.currency || baseCurrency)
      setInterval(existingBudget.interval || "MONTHLY")
      setColor(existingBudget.color || "indigo")
      setIcon(existingBudget.icon || "piggy-bank")
      setDefaultAccountId(existingBudget.defaultAccountId || "")
    } else if (!isEditMode) {
      setCurrency(baseCurrency)
    }
  }, [existingBudget, baseCurrency, isEditMode])

  // Mutations
  const createMutation = useCreateBudgetMutation()
  const updateMutation = useUpdateBudgetMutation()
  const deleteMutation = useDeleteBudgetMutation()

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isDeleting = deleteMutation.isPending

  const activeColorMeta = getNativeBudgetColors(color)
  const ActiveIconComponent = getBudgetIcon(icon, name)

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === defaultAccountId),
    [accounts, defaultAccountId]
  )

  const handleSave = async () => {
    haptics.light()
    setErrors({})

    // Validation via schema
    const validation = budgetSchema.safeParse({
      name,
      limit,
      currency,
      interval,
      color,
      icon,
      defaultAccountId: defaultAccountId || undefined,
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

    const centsStr = toCentsString(limit)

    try {
      if (isEditMode && editBudgetId) {
        await updateMutation.mutateAsync({
          id: editBudgetId,
          req: {
            id: editBudgetId,
            budget: {
              name: name.trim(),
              limitAmount: centsStr,
              status: existingBudget?.status || "ACTIVE",
              icon,
              color,
              defaultAccountId: defaultAccountId || undefined,
            } as unknown as Budget,
            propagation,
          },
        })
        haptics.success()
        toast.show({
          title: "Budget Updated",
          message: `"${name.trim()}" has been updated.`,
          type: "success",
        })
      } else {
        await createMutation.mutateAsync({
          budget: {
            name: name.trim(),
            limitAmount: centsStr,
            currency,
            interval,
            status: "ACTIVE",
            icon,
            color,
            defaultAccountId: defaultAccountId || undefined,
          },
        })
        haptics.success()
        toast.show({
          title: "Budget Created",
          message: `"${name.trim()}" is now active.`,
          type: "success",
        })
      }

      await invalidateFinanceQueries(queryClient)
      router.back()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: "Save Failed",
        message: err?.message || "Could not save budget allocation.",
        type: "error",
      })
    }
  }

  const handleDelete = () => {
    if (!editBudgetId) return
    haptics.warning()
    Alert.alert(
      "Delete Budget",
      `Are you sure you want to delete "${name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                id: editBudgetId,
                req: { id: editBudgetId },
              })
              haptics.success()
              toast.show({
                title: "Budget Deleted",
                message: `"${name}" was deleted.`,
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              if (router.canDismiss()) {
                router.dismiss()
              }
              router.replace("/(app)/finance/budgets")
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: "Delete Failed",
                message: err?.message || "Could not delete budget.",
                type: "error",
              })
            }
          },
        },
      ]
    )
  }

  if (isEditMode && isBudgetLoading) {
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
          headerTitle: isEditMode ? "Edit Budget" : "New Budget",
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
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Limit Amount Hero Card */}
          <Card style={styles.amountCard}>
            <Text style={styles.sectionHeaderLabel}>BUDGET LIMIT AMOUNT</Text>
            <View style={styles.amountInputRow}>
              <Text
                style={[styles.currencySymbol, { color: activeColorMeta.bar }]}
              >
                {getCurrencySymbol(currency)}
              </Text>
              <TextInput
                value={limit}
                onChangeText={(text) => {
                  setLimit(text.replace(/[^0-9.]/g, ""))
                  if (errors.limit)
                    setErrors((prev) => ({ ...prev, limit: "" }))
                }}
                placeholder="0.00"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="decimal-pad"
                containerStyle={styles.amountInputContainer}
                inputContainerStyle={styles.amountInputWrapper}
                style={[styles.amountInput, { color: activeColorMeta.text }]}
              />

              <TouchableOpacity
                disabled={isEditMode}
                onPress={() => {
                  haptics.light()
                  currencySheetRef.current?.expand()
                }}
                style={[
                  styles.currencySelectButton,
                  isEditMode && styles.currencySelectButtonDisabled,
                ]}
              >
                <Text style={styles.currencySelectCode} numberOfLines={1}>
                  {currency}
                </Text>
                {!isEditMode && (
                  <ChevronDown size={14} color={theme.colors.textMuted} />
                )}
              </TouchableOpacity>
            </View>
            {errors.limit ? (
              <Text style={styles.errorText}>{errors.limit}</Text>
            ) : null}
          </Card>

          {/* Budget Name Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>BUDGET DETAILS</Text>
            <TextInput
              label="Budget Name"
              value={name}
              onChangeText={(text) => {
                setName(text)
                if (errors.name) setErrors((prev) => ({ ...prev, name: "" }))
              }}
              placeholder="e.g. Dining & Restaurants, Groceries, Rent"
              placeholderTextColor={theme.colors.textMuted}
              error={errors.name}
              containerStyle={{ marginBottom: 16 }}
            />

            {/* Recurrence Interval */}
            <Text style={styles.fieldSubLabel}>Recurrence Frequency</Text>
            {isEditMode ? (
              <View style={styles.intervalRow}>
                <View
                  style={[
                    styles.intervalPill,
                    styles.intervalPillActive,
                    {
                      borderColor: activeColorMeta.bar,
                      backgroundColor: activeColorMeta.bg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.intervalPillText,
                      styles.intervalPillTextActive,
                      { color: activeColorMeta.text },
                    ]}
                  >
                    {INTERVAL_OPTIONS.find((opt) => opt.value === interval)
                      ?.label || interval}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.intervalRow}>
                {INTERVAL_OPTIONS.map((opt) => {
                  const isSelected = interval === opt.value
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => {
                        haptics.selection()
                        setInterval(opt.value)
                      }}
                      style={[
                        styles.intervalPill,
                        isSelected && [
                          styles.intervalPillActive,
                          { borderColor: activeColorMeta.bar },
                        ],
                      ]}
                    >
                      <Text
                        style={[
                          styles.intervalPillText,
                          isSelected && [
                            styles.intervalPillTextActive,
                            { color: activeColorMeta.text },
                          ],
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* Limit Propagation Rule (Edit mode only) */}
            {isEditMode && (
              <>
                <Text style={[styles.fieldSubLabel, { marginTop: 16 }]}>
                  Limit Propagation Rule
                </Text>
                <View style={styles.intervalRow}>
                  {PROPAGATION_OPTIONS.map((opt) => {
                    const isSelected = propagation === opt.value
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => {
                          haptics.selection()
                          setPropagation(opt.value)
                        }}
                        style={[
                          styles.intervalPill,
                          isSelected && [
                            styles.intervalPillActive,
                            { borderColor: activeColorMeta.bar },
                          ],
                        ]}
                      >
                        <Text
                          style={[
                            styles.intervalPillText,
                            isSelected && [
                              styles.intervalPillTextActive,
                              { color: activeColorMeta.text },
                            ],
                          ]}
                          numberOfLines={1}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <Text style={styles.fieldHelperText}>
                  {propagation === "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY"
                    ? "Applies to the current period and all future periods."
                    : "Applies limit modification only to the current active period."}
                </Text>
              </>
            )}

            {/* Default Account Selector */}
            <Text style={[styles.fieldSubLabel, { marginTop: 16 }]}>
              Default Account (Optional)
            </Text>
            <AccountCardSelect
              account={selectedAccount}
              onPress={() => {
                Keyboard.dismiss()
                accountSheetRef.current?.expand()
              }}
              placeholder="None (Any Account)"
              subtitle="Any linked payment method"
            />
          </Card>

          {/* Color & Icon Customization Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>APPEARANCE</Text>

            {/* Color Palette */}
            <Text style={styles.fieldSubLabel}>Color Accent</Text>
            <View style={styles.colorPaletteRow}>
              {AVAILABLE_COLORS.map((c) => {
                const meta = getNativeBudgetColors(c)
                const isSelected = color === c
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => {
                      haptics.selection()
                      setColor(c)
                    }}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: meta.bar },
                      isSelected && styles.colorCircleSelected,
                    ]}
                  >
                    {isSelected && <Check size={16} color="#ffffff" />}
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Category Icon */}
            <View style={styles.iconHeaderRow}>
              <Text style={styles.fieldSubLabel}>Category Icon</Text>
              <View
                style={[
                  styles.iconPreviewBadge,
                  {
                    backgroundColor: activeColorMeta.bg,
                    borderColor: activeColorMeta.border,
                  },
                ]}
              >
                <ActiveIconComponent size={18} color={activeColorMeta.bar} />
                <Text
                  style={[
                    styles.iconPreviewText,
                    { color: activeColorMeta.text },
                  ]}
                >
                  {icon}
                </Text>
              </View>
            </View>

            <View style={styles.iconGrid}>
              {Object.keys(BUDGET_ICONS).map((iconSlug) => {
                const IconComp = BUDGET_ICONS[iconSlug]
                const isSelected = icon === iconSlug
                return (
                  <TouchableOpacity
                    key={iconSlug}
                    onPress={() => {
                      haptics.selection()
                      setIcon(iconSlug)
                    }}
                    style={[
                      styles.iconGridItem,
                      isSelected && [
                        styles.iconGridItemActive,
                        {
                          backgroundColor: activeColorMeta.bg,
                          borderColor: activeColorMeta.bar,
                        },
                      ],
                    ]}
                  >
                    <IconComp
                      size={20}
                      color={
                        isSelected
                          ? activeColorMeta.bar
                          : theme.colors.textMuted
                      }
                    />
                  </TouchableOpacity>
                )
              })}
            </View>
          </Card>

          {/* Action Footer */}
          <View style={styles.actionFooter}>
            <Button
              onPress={handleSave}
              loading={isSaving}
              variant="primary"
              size="lg"
            >
              {isEditMode ? "Save Changes" : "Create Budget"}
            </Button>

            {isEditMode && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={isDeleting}
                style={styles.deleteBtn}
              >
                {isDeleting ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.destructive}
                  />
                ) : (
                  <>
                    <Trash2 size={16} color={theme.colors.destructive} />
                    <Text style={styles.deleteBtnText}>Delete Budget</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Currency Picker Bottom Sheet */}
      <CurrencyPickerSheet
        ref={currencySheetRef}
        currencies={currencies}
        selectedCurrency={currency}
        onSelect={(cur) => {
          setCurrency(cur)
          currencySheetRef.current?.close()
        }}
      />

      {/* Account Picker Bottom Sheet */}
      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        institutions={institutions}
        selectedAccountId={defaultAccountId}
        onSelect={(accId) => {
          setDefaultAccountId(accId)
          accountSheetRef.current?.close()
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  keyboardView: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  headerBtn: {
    padding: 8,
  },
  headerSaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
  },
  headerSaveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primaryForeground,
  },
  amountCard: {
    padding: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: "800",
    marginRight: 6,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flexShrink: 0,
  },
  amountInputContainer: {
    flex: 1,
    marginVertical: 0,
  },
  amountInputWrapper: {
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  amountInput: {
    fontSize: 32,
    fontWeight: "800",
    padding: 0,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  currencySelectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 68,
  },
  currencySelectButtonDisabled: {
    opacity: 0.75,
    minWidth: 52,
  },
  currencySelectCode: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    flexShrink: 0,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
    marginTop: 6,
  },
  sectionCard: {
    padding: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fieldSubLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  fieldHelperText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 6,
    lineHeight: 16,
  },
  intervalRow: {
    flexDirection: "row",
    gap: 8,
  },
  intervalPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  intervalPillActive: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  intervalPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  intervalPillTextActive: {
    fontWeight: "700",
  },
  selectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  selectorIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectorValueText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    flex: 1,
  },
  selectorPlaceholder: {
    color: theme.colors.textMuted,
    fontWeight: "400",
  },
  colorPaletteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  colorCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: "#ffffff",
    transform: [{ scale: 1.08 }],
  },
  iconHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  iconPreviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  iconPreviewText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  iconGridItem: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGridItemActive: {
    borderWidth: 1.5,
  },
  actionFooter: {
    marginTop: 8,
    gap: 12,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
    backgroundColor: "rgba(244, 63, 94, 0.08)",
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.destructive,
  },
})

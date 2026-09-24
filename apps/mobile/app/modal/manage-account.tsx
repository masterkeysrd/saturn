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
  Image,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  X,
  Check,
  ChevronDown,
  Trash2,
  Landmark,
  CreditCard,
  Coins,
  Wallet,
} from "lucide-react-native"
import {
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useGetAccountQuery,
  useListInstitutionsQuery,
  useListCurrenciesQuery,
  useGetFinanceSettingsQuery,
  type Account,
  type Account_Type,
  type Account_InstitutionInfo,
  type CurrencyInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { accountSchema } from "@saturn/schemas"
import {
  toCentsString,
  formatCents,
  getCurrencySymbol,
  getInstitutionLogoUrl,
  AVAILABLE_COLORS,
  COLOR_HEX_MAP,
  ACCOUNT_TYPES,
  type AccountTypeIconName,
} from "@saturn/core"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import {
  CurrencyPickerSheet,
  InstitutionPickerSheet,
} from "@/components/finance/sheets"
import { invalidateFinanceQueries } from "@/components/finance/finance-utils"
import { CardAccountItem } from "@/components/finance/card-account-item"

const ACCOUNT_TYPE_ICONS: Record<AccountTypeIconName, any> = {
  landmark: Landmark,
  "credit-card": CreditCard,
  coins: Coins,
  wallet: Wallet,
}

export default function ManageAccountModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { id: editAccountId } = useLocalSearchParams<{ id?: string }>()
  const isEditMode = Boolean(editAccountId)
  const queryClient = useQueryClient()
  const toast = useToast()

  // Bottom sheets
  const currencySheetRef = useRef<BottomSheet>(null)
  const institutionSheetRef = useRef<BottomSheet>(null)

  // Fetch settings & base currency
  const { data: settingsData } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // Fetch currencies
  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: !!activeSpaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies: CurrencyInfo[] = currenciesData?.currencies || []

  // Fetch institutions
  const { data: instData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const institutions: Account_InstitutionInfo[] = instData?.institutions || []
  const instMap = useMemo(() => {
    const map = new Map<string, Account_InstitutionInfo>()
    institutions.forEach((i) => {
      if (i.id) map.set(i.id, i)
    })
    return map
  }, [institutions])

  // Fetch existing account if edit mode
  const { data: existingAccount, isLoading: isAccountLoading } =
    useGetAccountQuery(
      { id: editAccountId || "" },
      { enabled: isEditMode && !!editAccountId && !!activeSpaceId }
    )

  // Form State
  const [name, setName] = useState("")
  const [type, setType] = useState<Account_Type>("BANK")
  const [institutionId, setInstitutionId] = useState("")
  const [currency, setCurrency] = useState(baseCurrency)
  const [initialBalance, setInitialBalance] = useState("0")
  const [creditLimit, setCreditLimit] = useState("")
  const [lastFour, setLastFour] = useState("")
  const [color, setColor] = useState("indigo")
  const [isActive, setIsActive] = useState(true)
  const [isDefault, setIsDefault] = useState(false)
  const [instLogoError, setInstLogoError] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Initialize existing account values
  useEffect(() => {
    if (existingAccount) {
      setName(existingAccount.name || "")
      setType(existingAccount.type || "BANK")
      setInstitutionId(existingAccount.institutionId || "")
      setInstLogoError(false)
      setCurrency(existingAccount.currency || baseCurrency)
      setInitialBalance(
        formatCents(existingAccount.initialBalance || "0").toString()
      )
      setCreditLimit(
        existingAccount.creditLimit
          ? formatCents(existingAccount.creditLimit).toString()
          : ""
      )
      setLastFour(existingAccount.lastFour || "")
      setColor(existingAccount.color || "indigo")
      setIsActive(existingAccount.isActive ?? true)
      setIsDefault(existingAccount.isDefault ?? false)
    } else if (!isEditMode) {
      setCurrency(baseCurrency)
    }
  }, [existingAccount, baseCurrency, isEditMode])

  // Mutations
  const createMutation = useCreateAccountMutation()
  const updateMutation = useUpdateAccountMutation()
  const deleteMutation = useDeleteAccountMutation()

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isDeleting = deleteMutation.isPending

  const selectedInstitution = institutionId
    ? instMap.get(institutionId)
    : undefined
  const instLogoUrl = selectedInstitution
    ? selectedInstitution.logoUrl ||
      getInstitutionLogoUrl(
        selectedInstitution.domain,
        selectedInstitution.name
      )
    : ""

  // Live Preview Account Object
  const previewAccount: Account = useMemo(
    () => ({
      id: editAccountId || "preview",
      name: name.trim() || "Account Name",
      type,
      currency,
      currentBalance: toCentsString(initialBalance || "0"),
      initialBalance: toCentsString(initialBalance || "0"),
      creditLimit:
        type === "CREDIT_CARD" && creditLimit
          ? toCentsString(creditLimit)
          : "0",
      lastFour: lastFour.trim() || "",
      color,
      isActive,
      isDefault,
      institutionId: institutionId || "",
      notes: "",
      institution: selectedInstitution,
    }),
    [
      editAccountId,
      name,
      type,
      currency,
      initialBalance,
      creditLimit,
      lastFour,
      color,
      isActive,
      isDefault,
      institutionId,
      selectedInstitution,
    ]
  )

  const handleSave = async () => {
    haptics.light()
    setErrors({})

    const validation = accountSchema.safeParse({
      name: name.trim(),
      type,
      currency,
      initialBalance,
      creditLimit: type === "CREDIT_CARD" ? creditLimit : undefined,
      lastFour: lastFour.trim() || undefined,
      color,
      institutionId: institutionId || undefined,
      isActive,
      isDefault,
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

    const initBalanceCents = toCentsString(initialBalance || "0")
    const creditLimitCents =
      type === "CREDIT_CARD" && creditLimit ? toCentsString(creditLimit) : "0"

    try {
      if (isEditMode && editAccountId) {
        await updateMutation.mutateAsync({
          id: editAccountId,
          req: {
            id: editAccountId,
            account: {
              id: editAccountId,
              name: name.trim(),
              type,
              currency,
              initialBalance: initBalanceCents,
              creditLimit: creditLimitCents,
              lastFour: lastFour.trim(),
              color,
              isActive,
              isDefault,
              institutionId: institutionId,
              notes: existingAccount?.notes || "",
            },
          },
        })
        haptics.success()
        toast.show({
          title: "Account Updated",
          message: `"${name.trim()}" has been updated.`,
          type: "success",
        })
      } else {
        await createMutation.mutateAsync({
          account: {
            name: name.trim(),
            type,
            currency,
            initialBalance: initBalanceCents,
            creditLimit: creditLimitCents,
            lastFour: lastFour.trim(),
            color,
            isActive,
            isDefault,
            institutionId: institutionId,
            notes: "",
          },
        })
        haptics.success()
        toast.show({
          title: "Account Created",
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
        message: err?.message || "Could not save account details.",
        type: "error",
      })
    }
  }

  const handleDelete = () => {
    if (!editAccountId) return
    haptics.warning()
    Alert.alert(
      "Delete Account",
      `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                id: editAccountId,
                req: { id: editAccountId },
              })
              haptics.success()
              toast.show({
                title: "Account Deleted",
                message: `"${name}" was deleted.`,
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              if (router.canDismiss()) {
                router.dismiss()
              }
              router.replace("/(app)/finance/accounts")
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: "Delete Failed",
                message: err?.message || "Could not delete account.",
                type: "error",
              })
            }
          },
        },
      ]
    )
  }

  if (isEditMode && isAccountLoading) {
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
          headerTitle: isEditMode ? "Edit Account" : "New Account",
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
          {/* Live Card Preview */}
          <Text style={styles.sectionHeaderLabel}>CARD PREVIEW</Text>
          <View style={styles.previewWrapper}>
            <CardAccountItem
              acc={previewAccount}
              institution={selectedInstitution}
              baseCurrency={baseCurrency}
            />
          </View>

          {/* Account Type Selector */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>
              ACCOUNT CLASSIFICATION
            </Text>
            <View style={styles.typeGrid}>
              {ACCOUNT_TYPES.map((t) => {
                const isSelected = type === t.value
                const IconComponent = ACCOUNT_TYPE_ICONS[t.iconName] || Landmark
                return (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => {
                      haptics.selection()
                      setType(t.value)
                    }}
                    style={[
                      styles.typeGridItem,
                      isSelected && styles.typeGridItemActive,
                    ]}
                  >
                    <IconComponent
                      size={20}
                      color={
                        isSelected
                          ? theme.colors.primary
                          : theme.colors.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.typeGridItemText,
                        isSelected && styles.typeGridItemTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </Card>

          {/* General Information Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>GENERAL DETAILS</Text>

            <TextInput
              label="Account Name"
              value={name}
              onChangeText={(text) => {
                setName(text)
                if (errors.name) setErrors((prev) => ({ ...prev, name: "" }))
              }}
              placeholder="e.g. Chase Total Checking, Apple Card"
              placeholderTextColor={theme.colors.textMuted}
              error={errors.name}
              containerStyle={{ marginBottom: 16 }}
            />

            {/* Institution Selector */}
            <Text style={styles.fieldSubLabel}>Financial Institution</Text>
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                institutionSheetRef.current?.expand()
              }}
              style={styles.selectorRow}
            >
              <View style={styles.selectorLeft}>
                <View style={styles.selectorIconWrap}>
                  {instLogoUrl && !instLogoError ? (
                    <Image
                      source={{ uri: instLogoUrl }}
                      style={{ width: 20, height: 20, borderRadius: 4 }}
                      resizeMode="contain"
                      onError={() => setInstLogoError(true)}
                    />
                  ) : (
                    <Landmark size={16} color={theme.colors.primary} />
                  )}
                </View>
                <Text
                  style={[
                    styles.selectorValueText,
                    !selectedInstitution && styles.selectorPlaceholder,
                  ]}
                  numberOfLines={1}
                >
                  {selectedInstitution
                    ? selectedInstitution.name
                    : "Select Bank / Institution (Optional)"}
                </Text>
              </View>
              <ChevronDown size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>

            {/* Currency Selector */}
            <Text style={[styles.fieldSubLabel, { marginTop: 16 }]}>
              Account Currency
            </Text>
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                currencySheetRef.current?.expand()
              }}
              style={styles.selectorRow}
            >
              <View style={styles.selectorLeft}>
                <View style={styles.selectorIconWrap}>
                  <Text style={styles.currencyIconSymbol} numberOfLines={1}>
                    {getCurrencySymbol(currency)}
                  </Text>
                </View>
                <Text style={styles.selectorValueText} numberOfLines={1}>
                  {currency}
                </Text>
              </View>
              <ChevronDown size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </Card>

          {/* Financial Balances Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>BALANCES & LIMITS</Text>

            <TextInput
              label={
                isEditMode ? "Initial Balance (Anchor)" : "Starting Balance"
              }
              value={initialBalance}
              onChangeText={(text) => {
                setInitialBalance(text.replace(/[^0-9.-]/g, ""))
                if (errors.initialBalance)
                  setErrors((prev) => ({ ...prev, initialBalance: "" }))
              }}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              error={errors.initialBalance}
              containerStyle={{ marginBottom: 16 }}
            />

            {type === "CREDIT_CARD" && (
              <TextInput
                label="Credit Limit"
                value={creditLimit}
                onChangeText={(text) => {
                  setCreditLimit(text.replace(/[^0-9.]/g, ""))
                  if (errors.creditLimit)
                    setErrors((prev) => ({ ...prev, creditLimit: "" }))
                }}
                placeholder="e.g. 5000.00"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="decimal-pad"
                error={errors.creditLimit}
                containerStyle={{ marginBottom: 16 }}
              />
            )}

            <TextInput
              label="Last 4 Digits (Optional)"
              value={lastFour}
              onChangeText={(text) => {
                setLastFour(text.replace(/[^0-9]/g, "").slice(0, 4))
                if (errors.lastFour)
                  setErrors((prev) => ({ ...prev, lastFour: "" }))
              }}
              placeholder="e.g. 4210"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
              error={errors.lastFour}
            />
          </Card>

          {/* Card Color Theme */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>CARD COLOR ACCENT</Text>
            <View style={styles.colorPaletteRow}>
              {AVAILABLE_COLORS.map((c) => {
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
                      {
                        backgroundColor:
                          COLOR_HEX_MAP[c] || COLOR_HEX_MAP.indigo,
                      },
                      isSelected && styles.colorCircleSelected,
                    ]}
                  >
                    {isSelected && <Check size={16} color="#ffffff" />}
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
              {isEditMode ? "Save Changes" : "Create Account"}
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
                    <Text style={styles.deleteBtnText}>Delete Account</Text>
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

      {/* Institution Picker Bottom Sheet */}
      <InstitutionPickerSheet
        ref={institutionSheetRef}
        institutions={institutions}
        selectedInstitutionId={institutionId}
        onSelect={(instId) => {
          setInstitutionId(instId)
          setInstLogoError(false)
          institutionSheetRef.current?.close()
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
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  previewWrapper: {
    marginBottom: 8,
  },
  sectionCard: {
    padding: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeGridItem: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  typeGridItemActive: {
    borderColor: theme.colors.primary,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
  },
  typeGridItemText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
    flexShrink: 1,
  },
  typeGridItemTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
  },
  fieldSubLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 8,
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
    minWidth: 28,
    paddingHorizontal: 4,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  currencyIconSymbol: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.primary,
    flexShrink: 0,
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

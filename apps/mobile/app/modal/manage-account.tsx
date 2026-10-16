import { useState, useRef, useMemo } from "react"
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
  ChevronDown,
  Trash2,
  Landmark,
  CreditCard,
  Coins,
  Wallet,
  Lock,
} from "lucide-react-native"
import {
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
  useGetAccountQuery,
  useListInstitutionsQuery,
  useListCurrenciesQuery,
  useGetSettingsQuery,
  type Account,
  type Account_Type,
  type Account_InstitutionInfo,
  type CurrencyInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { useForm, useWatch, type Control } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AccountSchema, type AccountFormValues } from "@saturn/schemas"
import {
  toCentsString,
  formatCents,
  getCurrencySymbol,
  getInstitutionLogoUrl,
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
import { FormColorPicker } from "@/components/ui/form-primitives"
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

interface AccountCardPreviewProps {
  control: Control<AccountFormValues>
  editAccountId?: string
  selectedInstitution?: Account_InstitutionInfo
  baseCurrency: string
}

function AccountCardPreview({
  control,
  editAccountId,
  selectedInstitution,
  baseCurrency,
}: AccountCardPreviewProps) {
  const watchedValues = useWatch({ control })
  const name = watchedValues?.name || ""
  const type = (watchedValues?.type || "BANK") as Account_Type
  const currency = watchedValues?.currency || baseCurrency
  const initialBalance = watchedValues?.initialBalance || "0"
  const creditLimit = watchedValues?.creditLimit || ""
  const lastFour = watchedValues?.lastFour || ""
  const color = watchedValues?.color || "indigo"
  const isActive = watchedValues?.isActive ?? true
  const isDefault = watchedValues?.isDefault ?? false
  const institutionId = watchedValues?.institutionId || ""

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

  return (
    <CardAccountItem
      acc={previewAccount}
      institution={selectedInstitution}
      baseCurrency={baseCurrency}
    />
  )
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
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // Fetch currencies
  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: !!activeSpaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies: CurrencyInfo[] = useMemo(
    () => currenciesData?.currencies || [],
    [currenciesData?.currencies]
  )

  // Fetch institutions
  const { data: instData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const institutions: Account_InstitutionInfo[] = useMemo(
    () => instData?.institutions || [],
    [instData?.institutions]
  )
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

  const defaultFormValues: AccountFormValues = useMemo(
    () => ({
      name: existingAccount?.name || "",
      type: (existingAccount?.type || "BANK") as Account_Type,
      institutionId: existingAccount?.institutionId || "",
      currency: existingAccount?.currency || baseCurrency,
      initialBalance: existingAccount?.initialBalance
        ? formatCents(existingAccount.initialBalance).toString()
        : "0",
      creditLimit: existingAccount?.creditLimit
        ? formatCents(existingAccount.creditLimit).toString()
        : "",
      lastFour: existingAccount?.lastFour || "",
      color: existingAccount?.color || "indigo",
      isActive: existingAccount?.isActive ?? true,
      isDefault: existingAccount?.isDefault ?? false,
      notes: existingAccount?.notes || "",
    }),
    [existingAccount, baseCurrency]
  )

  // RHF Form
  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(AccountSchema),
    defaultValues: defaultFormValues,
    values: defaultFormValues,
    resetOptions: { keepDirtyValues: true },
  })

  const [instLogoError, setInstLogoError] = useState(false)

  // Watch discrete fields driving selectors and conditional inputs
  const [type = "BANK", currency = baseCurrency, institutionId = ""] = useWatch(
    {
      control,
      name: ["type", "currency", "institutionId"] as const,
    }
  )

  // Mutations
  const createMutation = useCreateAccountMutation()
  const updateMutation = useUpdateAccountMutation()
  const deleteMutation = useDeleteAccountMutation()

  const isSaving =
    createMutation.isPending || updateMutation.isPending || isSubmitting
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

  const selectedCurrencyInfo = useMemo(
    () =>
      currencies.find((c) => c.code.toUpperCase() === currency.toUpperCase()),
    [currencies, currency]
  )

  const selectedTypeInfo = useMemo(
    () => ACCOUNT_TYPES.find((t) => t.value === type),
    [type]
  )
  const SelectedTypeIcon = selectedTypeInfo
    ? ACCOUNT_TYPE_ICONS[selectedTypeInfo.iconName] || Landmark
    : Landmark

  const onValid = async (values: AccountFormValues) => {
    haptics.light()

    const initBalanceCents =
      isEditMode && existingAccount
        ? existingAccount.initialBalance || "0"
        : toCentsString(values.initialBalance || "0")
    const creditLimitCents =
      values.type === "CREDIT_CARD" && values.creditLimit
        ? toCentsString(values.creditLimit)
        : "0"

    try {
      if (isEditMode && editAccountId) {
        await updateMutation.mutateAsync({
          id: editAccountId,
          req: {
            id: editAccountId,
            account: {
              name: values.name.trim(),
              creditLimit: creditLimitCents,
              lastFour: values.lastFour?.trim() || "",
              color: values.color,
              isActive: values.isActive,
              isDefault: values.isDefault,
              institutionId: values.institutionId || "",
              notes: existingAccount?.notes || "",
            } as unknown as Account,
          },
        })
        haptics.success()
        toast.show({
          title: "Account Updated",
          message: `"${values.name.trim()}" has been updated.`,
          type: "success",
        })
      } else {
        await createMutation.mutateAsync({
          account: {
            name: values.name.trim(),
            type: values.type,
            currency: values.currency,
            initialBalance: initBalanceCents,
            creditLimit: creditLimitCents,
            lastFour: values.lastFour?.trim() || "",
            color: values.color,
            isActive: values.isActive,
            isDefault: values.isDefault,
            institutionId: values.institutionId || "",
            notes: "",
          },
        })
        haptics.success()
        toast.show({
          title: "Account Created",
          message: `"${values.name.trim()}" is now active.`,
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
    const accountName = getValues("name")
    haptics.warning()
    Alert.alert(
      "Delete Account",
      `Are you sure you want to delete "${accountName}"? This action cannot be undone.`,
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
                message: `"${accountName}" was deleted.`,
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
              onPress={handleSubmit(onValid)}
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
            <AccountCardPreview
              control={control}
              editAccountId={editAccountId}
              selectedInstitution={selectedInstitution}
              baseCurrency={baseCurrency}
            />
          </View>

          {/* Account Type Selector */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>
              ACCOUNT CLASSIFICATION
            </Text>
            {isEditMode ? (
              <View style={styles.selectorRow}>
                <View style={styles.selectorLeft}>
                  <View style={styles.selectorIconWrap}>
                    <SelectedTypeIcon size={16} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.selectorValueText}>
                    {selectedTypeInfo?.label || type}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.typeGrid}>
                {ACCOUNT_TYPES.map((t) => {
                  const isSelected = type === t.value
                  const IconComponent =
                    ACCOUNT_TYPE_ICONS[t.iconName] || Landmark
                  return (
                    <TouchableOpacity
                      key={t.value}
                      onPress={() => {
                        haptics.selection()
                        setValue("type", t.value, { shouldValidate: true })
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
            )}
          </Card>

          {/* General Information Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>GENERAL DETAILS</Text>

            <TextInput
              control={control}
              name="name"
              label="Account Name"
              placeholder="e.g. Chase Total Checking, Apple Card"
              placeholderTextColor={theme.colors.textMuted}
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
              disabled={isEditMode}
              onPress={() => {
                haptics.light()
                currencySheetRef.current?.expand()
              }}
              style={[
                styles.selectorRow,
                isEditMode && styles.selectorRowDisabled,
              ]}
            >
              <View style={styles.selectorLeft}>
                <View
                  style={[
                    styles.selectorIconWrap,
                    isEditMode && styles.selectorIconWrapDisabled,
                  ]}
                >
                  <Text style={styles.currencyIconSymbol} numberOfLines={1}>
                    {getCurrencySymbol(currency)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.selectorValueText,
                    isEditMode && styles.selectorValueTextDisabled,
                  ]}
                  numberOfLines={1}
                >
                  {selectedCurrencyInfo
                    ? `${selectedCurrencyInfo.name} (${currency})`
                    : currency}
                </Text>
              </View>
              {isEditMode ? (
                <Lock size={16} color={theme.colors.textMuted} />
              ) : (
                <ChevronDown size={16} color={theme.colors.textMuted} />
              )}
            </TouchableOpacity>
          </Card>

          {/* Financial Balances Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>BALANCES & LIMITS</Text>

            <TextInput
              control={control}
              name="initialBalance"
              label={isEditMode ? "Initial Balance" : "Starting Balance"}
              editable={!isEditMode}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              inputContainerStyle={
                isEditMode
                  ? {
                      opacity: 0.75,
                      backgroundColor: theme.colors.surfaceSubtle,
                    }
                  : undefined
              }
              style={
                isEditMode ? { color: theme.colors.textSecondary } : undefined
              }
              containerStyle={{ marginBottom: 16 }}
            />

            {type === "CREDIT_CARD" && (
              <TextInput
                control={control}
                name="creditLimit"
                label="Credit Limit"
                placeholder="e.g. 5000.00"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="decimal-pad"
                containerStyle={{ marginBottom: 16 }}
              />
            )}

            <TextInput
              control={control}
              name="lastFour"
              label="Last 4 Digits (Optional)"
              placeholder="e.g. 4210"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
            />
          </Card>

          {/* Card Color Theme */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>CARD COLOR ACCENT</Text>
            <FormColorPicker control={control} name="color" />
          </Card>

          {/* Action Footer */}
          <View style={styles.actionFooter}>
            <Button
              onPress={handleSubmit(onValid)}
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
          setValue("currency", cur, { shouldValidate: true })
          currencySheetRef.current?.close()
        }}
      />

      {/* Institution Picker Bottom Sheet */}
      <InstitutionPickerSheet
        ref={institutionSheetRef}
        institutions={institutions}
        selectedInstitutionId={institutionId}
        onSelect={(instId) => {
          setValue("institutionId", instId, { shouldValidate: true })
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
  selectorRowDisabled: {
    opacity: 0.75,
    backgroundColor: theme.colors.surfaceSubtle,
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
  selectorIconWrapDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
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
  selectorValueTextDisabled: {
    color: theme.colors.textSecondary,
  },
  selectorPlaceholder: {
    color: theme.colors.textMuted,
    fontWeight: "400",
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

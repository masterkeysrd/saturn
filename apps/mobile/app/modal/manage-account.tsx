import { useState, useRef, useMemo } from "react"
import {
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
import { invalidateFinanceQueries, useI18n } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
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
  const { t } = useI18n()
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
      name: name.trim() || t("finance.accounts.mobile.previewFallbackName"),
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
      t,
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
  const { t, locale } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

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
          title: t("finance.accounts.mobile.toastUpdatedTitle"),
          message: t("finance.accounts.mobile.toastUpdatedDesc", {
            name: values.name.trim(),
          }),
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
          title: t("finance.accounts.mobile.toastCreatedTitle"),
          message: t("finance.accounts.mobile.toastCreatedDesc", {
            name: values.name.trim(),
          }),
          type: "success",
        })
      }

      await invalidateFinanceQueries(queryClient)
      router.back()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: t("calendar.saveFailed"),
        message: err?.message || t("finance.accounts.mobile.toastSaveFailed"),
        type: "error",
      })
    }
  }

  const handleDelete = () => {
    if (!editAccountId) return
    const accountName = getValues("name")
    haptics.warning()
    Alert.alert(
      t("finance.accounts.deleteTitle"),
      t("finance.accounts.mobile.deleteAlertDesc", { name: accountName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                id: editAccountId,
                req: { id: editAccountId },
              })
              haptics.success()
              toast.show({
                title: t("finance.accounts.deleteSuccessTitle"),
                message: t("finance.accounts.mobile.toastDeleteDesc", {
                  name: accountName,
                }),
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
                title: t("finance.budgets.deleteFailedTitle"),
                message:
                  err?.message ||
                  t("finance.accounts.mobile.toastDeleteFailed"),
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: isEditMode
            ? t("finance.accounts.sheet.editTitle")
            : t("finance.accounts.sheet.createTitle"),
          ...(Platform.OS === "ios"
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: "button",
                    label: t("common.close"),
                    icon: { type: "sfSymbol", name: "xmark" },
                    onPress: () => router.back(),
                  },
                ],
                unstable_headerRightItems: () => [
                  isSaving
                    ? {
                        type: "custom",
                        hidesSharedBackground: true,
                        element: (
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
                          />
                        ),
                      }
                    : {
                        type: "button",
                        label: t("common.save"),
                        variant: "done",
                        onPress: () => handleSubmit(onValid)(),
                      },
                ],
              }
            : {
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.headerBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <X size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                ),
                headerRight: () => (
                  <TouchableOpacity
                    onPress={() => handleSubmit(onValid)()}
                    disabled={isSaving}
                    style={[styles.headerSaveBtn, isSaving && { opacity: 0.6 }]}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.headerSaveBtnText}>
                        {t("common.save")}
                      </Text>
                    )}
                  </TouchableOpacity>
                ),
              }),
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
          <Text style={styles.sectionHeaderLabel}>
            {t("finance.accounts.mobile.cardPreview").toUpperCase()}
          </Text>
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
              {t("finance.accounts.mobile.accountClassification").toUpperCase()}
            </Text>
            {isEditMode ? (
              <View style={styles.selectorRow}>
                <View style={styles.selectorLeft}>
                  <View style={styles.selectorIconWrap}>
                    <SelectedTypeIcon size={16} color={colors.primary} />
                  </View>
                  <Text style={styles.selectorValueText}>
                    {getLocalizedEnumLabel(
                      "finance",
                      "accountType",
                      type,
                      locale
                    )}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.typeGrid}>
                {ACCOUNT_TYPES.map((opt) => {
                  const isSelected = type === opt.value
                  const IconComponent =
                    ACCOUNT_TYPE_ICONS[opt.iconName] || Landmark
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => {
                        haptics.selection()
                        setValue("type", opt.value, { shouldValidate: true })
                      }}
                      style={[
                        styles.typeGridItem,
                        isSelected && styles.typeGridItemActive,
                      ]}
                    >
                      <IconComponent
                        size={20}
                        color={isSelected ? colors.primary : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.typeGridItemText,
                          isSelected && styles.typeGridItemTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {getLocalizedEnumLabel(
                          "finance",
                          "accountType",
                          opt.value,
                          locale
                        )}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </Card>

          {/* General Information Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>
              {t("finance.accounts.mobile.generalDetails").toUpperCase()}
            </Text>

            <TextInput
              control={control}
              name="name"
              label={t("finance.accounts.sheet.nameLabel")}
              placeholder={t("finance.accounts.mobile.namePlaceholder")}
              placeholderTextColor={colors.textMuted}
              containerStyle={{ marginBottom: 16 }}
            />

            {/* Institution Selector */}
            <Text style={styles.fieldSubLabel}>
              {t("finance.accounts.sheet.institutionLabel")}
            </Text>
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
                    <Landmark size={16} color={colors.primary} />
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
                    : t("finance.accounts.mobile.selectInstitutionPlaceholder")}
                </Text>
              </View>
              <ChevronDown size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Currency Selector */}
            <Text style={[styles.fieldSubLabel, { marginTop: 16 }]}>
              {t("finance.accounts.mobile.accountCurrency")}
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
                <Lock size={16} color={colors.textMuted} />
              ) : (
                <ChevronDown size={16} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          </Card>

          {/* Financial Balances Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>
              {t("finance.accounts.mobile.balancesLimits").toUpperCase()}
            </Text>

            <TextInput
              control={control}
              name="initialBalance"
              label={
                isEditMode
                  ? t("finance.accounts.sheet.initialBalanceLabel")
                  : t("finance.accounts.mobile.startingBalance")
              }
              editable={!isEditMode}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              inputContainerStyle={
                isEditMode
                  ? {
                      opacity: 0.75,
                      backgroundColor: colors.surfaceSubtle,
                    }
                  : undefined
              }
              style={isEditMode ? { color: colors.textSecondary } : undefined}
              containerStyle={{ marginBottom: 16 }}
            />

            {type === "CREDIT_CARD" && (
              <TextInput
                control={control}
                name="creditLimit"
                label={t("finance.accounts.sheet.creditLimitLabel")}
                placeholder={t("finance.accounts.sheet.creditLimitPlaceholder")}
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                containerStyle={{ marginBottom: 16 }}
              />
            )}

            <TextInput
              control={control}
              name="lastFour"
              label={t("finance.accounts.sheet.lastFourLabel")}
              placeholder={t("finance.accounts.sheet.lastFourPlaceholder")}
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
            />
          </Card>

          {/* Card Color Theme */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>
              {t("finance.accounts.mobile.cardColorAccent").toUpperCase()}
            </Text>
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
              {isEditMode
                ? t("finance.accounts.sheet.saveSubmit")
                : t("finance.accounts.sheet.createSubmit")}
            </Button>

            {isEditMode && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={isDeleting}
                style={styles.deleteBtn}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.destructive} />
                ) : (
                  <>
                    <Trash2 size={16} color={colors.destructive} />
                    <Text style={styles.deleteBtnText}>
                      {t("finance.accounts.card.delete")}
                    </Text>
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

const createStyles = (t: SaturnMobileTheme) => ({
  loadingContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  keyboardView: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
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
    backgroundColor: t.colors.primary,
    borderRadius: t.radius.md,
  },
  headerSaveBtnText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: t.colors.primaryForeground,
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  previewWrapper: {
    marginBottom: 8,
  },
  sectionCard: {
    padding: 16,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  typeGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  typeGridItem: {
    width: "48%" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  typeGridItemActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  typeGridItemText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    flexShrink: 1,
  },
  typeGridItemTextActive: {
    color: t.colors.textPrimary,
    fontWeight: "700" as const,
  },
  fieldSubLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
    marginBottom: 8,
  },
  selectorRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  selectorRowDisabled: {
    opacity: 0.75,
    backgroundColor: t.colors.surfaceSubtle,
  },
  selectorLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    flex: 1,
  },
  selectorIconWrap: {
    minWidth: 28,
    paddingHorizontal: 4,
    height: 28,
    borderRadius: 6,
    backgroundColor: t.colors.primarySubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  selectorIconWrapDisabled: {
    backgroundColor: t.colors.surfaceSubtle,
  },
  currencyIconSymbol: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: t.colors.primary,
    flexShrink: 0,
  },
  selectorValueText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flex: 1,
  },
  selectorValueTextDisabled: {
    color: t.colors.textSecondary,
  },
  selectorPlaceholder: {
    color: t.colors.textMuted,
    fontWeight: "400" as const,
  },
  actionFooter: {
    marginTop: 8,
    gap: 12,
  },
  deleteBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 14,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
    backgroundColor: t.colors.destructiveSubtle,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.destructive,
  },
})

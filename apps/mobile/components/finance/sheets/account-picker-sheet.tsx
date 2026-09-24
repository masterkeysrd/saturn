import React, { forwardRef, useState, useMemo } from "react"
import { Text, View, ActivityIndicator, Image } from "react-native"
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetTextInput,
  TouchableOpacity,
} from "@gorhom/bottom-sheet"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  Check,
  Landmark,
  CreditCard,
  Coins,
  Wallet,
  Search,
} from "lucide-react-native"
import {
  type Account,
  type Account_Type,
  type Account_InstitutionInfo,
  useListInstitutionsQuery,
} from "@saturn/api/saturn/finance/v1/finance"
import { formatAmount, getInstitutionLogoUrl } from "@saturn/core"
import { useSpace } from "@/lib/space-context"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { AppBottomSheet, BottomSheetHeader } from "@/components/ui/bottom-sheet"
import { sheetStyles } from "./sheet-styles"

export interface AccountPickerSheetProps {
  title?: string
  accounts: Account[]
  institutions?: Account_InstitutionInfo[]
  selectedAccountId: string
  onSelect: (accountId: string) => void
  allowNoAccount?: boolean
  isLoading?: boolean
  snapPoints?: (string | number)[]
}

function renderAccountTypeIcon(
  type?: Account_Type,
  color: string = theme.colors.textMuted
) {
  switch (type) {
    case "CREDIT_CARD":
      return <CreditCard size={18} color={color} />
    case "CASH":
      return <Coins size={18} color={color} />
    case "DIGITAL_ACCOUNT":
      return <Wallet size={18} color={color} />
    default:
      return <Landmark size={18} color={color} />
  }
}

function formatAccountType(type?: Account_Type): string {
  switch (type) {
    case "CREDIT_CARD":
      return "Credit Card"
    case "CASH":
      return "Cash"
    case "DIGITAL_ACCOUNT":
      return "Digital Wallet"
    case "BANK":
      return "Checking / Bank"
    default:
      return "Account"
  }
}

function AccountLogoBadge({
  account,
  institution,
  nativeColors,
}: {
  account: Account
  institution?: Account_InstitutionInfo
  nativeColors: { bg: string; border: string; bar: string }
}) {
  const [hasError, setHasError] = useState(false)
  const inst = institution || account.institution
  const logoUrl =
    inst?.logoUrl ||
    (inst?.domain || inst?.name
      ? getInstitutionLogoUrl(inst.domain, inst.name)
      : undefined) ||
    getInstitutionLogoUrl(undefined, account.name)

  const [prevUrl, setPrevUrl] = useState(logoUrl)
  if (prevUrl !== logoUrl) {
    setPrevUrl(logoUrl)
    setHasError(false)
  }

  const showLogo = Boolean(logoUrl && !hasError)

  return (
    <View
      style={[
        sheetStyles.accountIconBadge,
        showLogo
          ? {
              backgroundColor: theme.colors.surfaceHighlight,
              borderColor: theme.colors.border,
              borderWidth: 1,
            }
          : {
              backgroundColor: nativeColors.bg,
              borderColor: nativeColors.border,
              borderWidth: 1,
            },
      ]}
    >
      {showLogo ? (
        <Image
          source={{ uri: logoUrl }}
          style={sheetStyles.accountLogoImage}
          resizeMode="contain"
          onError={() => setHasError(true)}
        />
      ) : (
        renderAccountTypeIcon(account.type, nativeColors.bar)
      )}
    </View>
  )
}

export const AccountPickerSheet = forwardRef<
  BottomSheet,
  AccountPickerSheetProps
>(
  (
    {
      title = "Select Account",
      accounts,
      institutions: propInstitutions,
      selectedAccountId,
      onSelect,
      allowNoAccount = true,
      isLoading = false,
      snapPoints = ["65%"],
    },
    ref
  ) => {
    const insets = useSafeAreaInsets()
    const { activeSpaceId } = useSpace()
    const { data: instData } = useListInstitutionsQuery(
      { pageSize: 100, pageToken: "" },
      { enabled: !propInstitutions && !!activeSpaceId }
    )

    const instMap = useMemo(() => {
      const map = new Map<string, Account_InstitutionInfo>()
      const list = propInstitutions || instData?.institutions || []
      list.forEach((inst) => {
        if (inst.id) map.set(inst.id, inst as Account_InstitutionInfo)
      })
      return map
    }, [propInstitutions, instData])

    const [search, setSearch] = useState("")

    const filteredAccounts = useMemo(() => {
      const q = search.trim().toLowerCase()
      if (!q) return accounts
      return accounts.filter((acc) => {
        const inst =
          acc.institution ||
          (acc.institutionId ? instMap.get(acc.institutionId) : undefined)
        const instMatch = (inst?.name || "").toLowerCase().includes(q)
        const nameMatch = (acc.name || "").toLowerCase().includes(q)
        const lastFourMatch = (acc.lastFour || "").toLowerCase().includes(q)
        const currencyMatch = (acc.currency || "").toLowerCase().includes(q)
        const typeMatch = formatAccountType(acc.type).toLowerCase().includes(q)
        return (
          instMatch || nameMatch || lastFourMatch || currencyMatch || typeMatch
        )
      })
    }, [accounts, search, instMap])

    const handleSelect = (id: string) => {
      haptics.light()
      onSelect(id)
      setSearch("")
      if (ref && "current" in ref && ref.current) {
        ref.current.close()
      }
    }

    return (
      <AppBottomSheet ref={ref} snapPoints={snapPoints}>
        <BottomSheetFlatList
          data={filteredAccounts}
          keyExtractor={(acc) => acc.id || ""}
          contentContainerStyle={[
            sheetStyles.sheetListContent,
            {
              paddingHorizontal: 16,
              paddingBottom: Math.max(insets.bottom, 24),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <BottomSheetHeader
                title={title}
                onClose={() => {
                  if (ref && "current" in ref && ref.current) {
                    ref.current.close()
                  }
                }}
              />

              {/* Search Bar */}
              <View style={sheetStyles.accountSearchContainer}>
                <Search size={16} color={theme.colors.textMuted} />
                <BottomSheetTextInput
                  style={sheetStyles.accountSearchInput}
                  placeholder="Search by name, institution, last 4..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
              </View>

              {/* No Account (Cash / Off-ledger) */}
              {allowNoAccount && !search.trim() && (
                <TouchableOpacity
                  style={[
                    sheetStyles.accountListItem,
                    !selectedAccountId && sheetStyles.accountListItemActive,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => handleSelect("")}
                >
                  <View
                    style={[
                      sheetStyles.accountIconBadge,
                      {
                        backgroundColor: theme.colors.surfaceHighlight,
                        borderColor: theme.colors.border,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Coins size={18} color={theme.colors.textMuted} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={sheetStyles.accountItemTitle}>
                      No Account (Cash / Off-ledger)
                    </Text>
                    <Text style={sheetStyles.accountItemSubtitle}>
                      Does not deduct from bank balance
                    </Text>
                  </View>
                  {!selectedAccountId && (
                    <Check size={18} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          }
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primary}
                style={{ marginVertical: 20 }}
              />
            ) : (
              <View style={sheetStyles.emptySheetBox}>
                <Text style={sheetStyles.emptySheetText}>
                  {search.trim()
                    ? `No accounts found matching "${search}".`
                    : "No active accounts found."}
                </Text>
              </View>
            )
          }
          renderItem={({ item: acc }) => {
            const isSelected = selectedAccountId === acc.id
            const inst =
              acc.institution ||
              (acc.institutionId ? instMap.get(acc.institutionId) : undefined)
            const colorName = acc.color || inst?.color || "indigo"
            const nativeColors = getNativeBudgetColors(colorName)
            const isCredit = acc.type === "CREDIT_CARD"
            const rawBal = Number(acc.currentBalance || "0")

            // Balance text color matching card account guidelines
            const balanceColor =
              isCredit && rawBal > 0
                ? "#fb7185" // rose for credit card debt
                : isCredit && rawBal < 0
                  ? "#34d399" // emerald for overpayment
                  : theme.colors.textPrimary

            return (
              <TouchableOpacity
                key={acc.id}
                style={[
                  sheetStyles.accountListItem,
                  isSelected && sheetStyles.accountListItemActive,
                ]}
                activeOpacity={0.7}
                onPress={() => handleSelect(acc.id || "")}
              >
                <AccountLogoBadge
                  account={acc}
                  institution={inst}
                  nativeColors={nativeColors}
                />

                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={sheetStyles.accountItemTitle} numberOfLines={1}>
                    {acc.name}
                  </Text>
                  <View style={sheetStyles.accountMetaRow}>
                    <View style={sheetStyles.accountTypeTag}>
                      <Text style={sheetStyles.accountTypeTagText}>
                        {formatAccountType(acc.type)}
                      </Text>
                    </View>
                    {acc.lastFour ? (
                      <Text style={sheetStyles.accountLastFourText}>
                        •••• {acc.lastFour}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={sheetStyles.accountRightGroup}>
                  <Text
                    style={[
                      sheetStyles.accountBalanceText,
                      { color: balanceColor },
                    ]}
                  >
                    {isCredit && rawBal > 0 && "-"}
                    {formatAmount(acc.currentBalance, acc.currency)}
                  </Text>
                  {isSelected && (
                    <Check size={18} color={theme.colors.primary} />
                  )}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      </AppBottomSheet>
    )
  }
)

AccountPickerSheet.displayName = "AccountPickerSheet"

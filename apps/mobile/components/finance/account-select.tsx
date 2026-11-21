import React, { useState } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import {
  Landmark,
  CreditCard,
  Coins,
  Wallet,
  ChevronRight,
  AlertCircle,
} from "lucide-react-native"
import {
  type Account,
  type Account_InstitutionInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { getInstitutionLogoUrl } from "@saturn/core"
import { useI18n } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { useFormStyles } from "./forms/form-styles"

export interface AccountIconProps {
  account?: Account | null
  institution?: Account_InstitutionInfo
  size?: number
  color?: string
  fallbackIcon?: React.ReactNode
  style?: StyleProp<ViewStyle>
}

export function AccountIcon({
  account,
  institution,
  size = 16,
  color,
  fallbackIcon,
  style,
}: AccountIconProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const resolvedColor = color ?? colors.textMuted
  const [hasError, setHasError] = useState(false)
  const inst = institution || account?.institution
  const logoUrl =
    inst?.logoUrl ||
    (inst?.domain || inst?.name
      ? getInstitutionLogoUrl(inst.domain, inst.name)
      : undefined) ||
    (account ? getInstitutionLogoUrl(undefined, account.name) : undefined)

  const [prevUrl, setPrevUrl] = useState(logoUrl)
  if (prevUrl !== logoUrl) {
    setPrevUrl(logoUrl)
    setHasError(false)
  }

  if (logoUrl && !hasError) {
    return (
      <View
        style={[
          styles.iconContainer,
          { width: size, height: size, borderRadius: 4, overflow: "hidden" },
          style,
        ]}
      >
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size, height: size, borderRadius: 4 }}
          resizeMode="contain"
          onError={() => setHasError(true)}
        />
      </View>
    )
  }

  if (fallbackIcon) {
    return (
      <View
        style={[styles.iconContainer, { width: size, height: size }, style]}
      >
        {fallbackIcon}
      </View>
    )
  }

  if (!account) {
    return (
      <View
        style={[styles.iconContainer, { width: size, height: size }, style]}
      >
        <Landmark size={size} color={resolvedColor} />
      </View>
    )
  }

  const renderIcon = () => {
    switch (account.type) {
      case "CREDIT_CARD":
        return <CreditCard size={size} color={resolvedColor} />
      case "CASH":
        return <Coins size={size} color={resolvedColor} />
      case "DIGITAL_ACCOUNT":
        return <Wallet size={size} color={resolvedColor} />
      default:
        return <Landmark size={size} color={resolvedColor} />
    }
  }

  return (
    <View style={[styles.iconContainer, { width: size, height: size }, style]}>
      {renderIcon()}
    </View>
  )
}

export interface AccountRowProps {
  account?: Account | null
  institution?: Account_InstitutionInfo
  onPress: () => void
  label?: string
  placeholder?: string
  fallbackIcon?: React.ReactNode
  disabled?: boolean
  error?: string
  style?: StyleProp<ViewStyle>
}

export function AccountRow({
  account,
  institution,
  onPress,
  label,
  placeholder,
  fallbackIcon,
  disabled = false,
  error,
  style,
}: AccountRowProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const styles = useThemedStyles(createStyles)
  const formStyles = useFormStyles()

  return (
    <View style={style}>
      <TouchableOpacity
        style={[formStyles.formRow, disabled && styles.disabled]}
        activeOpacity={0.7}
        onPress={onPress}
        disabled={disabled}
      >
        <View style={formStyles.formRowLabelGroup}>
          <AccountIcon
            account={account}
            institution={institution}
            size={16}
            color={colors.textMuted}
            fallbackIcon={fallbackIcon}
          />
          <Text style={formStyles.formRowLabel}>
            {label ?? t("finance.pickers.account.rowLabel")}
          </Text>
        </View>
        <View style={formStyles.formRowValueGroup}>
          <Text
            style={[
              formStyles.formRowValueText,
              !account && formStyles.placeholderText,
            ]}
            numberOfLines={1}
          >
            {account
              ? `${account.name} (${account.currency})`
              : (placeholder ?? t("finance.pickers.account.rowPlaceholder"))}
          </Text>
          <ChevronRight size={14} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
      {error ? (
        <View style={styles.errorRow}>
          <AlertCircle size={12} color={colors.destructive} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  )
}

export interface AccountCardSelectProps {
  account?: Account | null
  institution?: Account_InstitutionInfo
  onPress: () => void
  placeholder?: string
  subtitle?: string
  disabled?: boolean
  error?: string
  style?: StyleProp<ViewStyle>
}

export function AccountCardSelect({
  account,
  institution,
  onPress,
  placeholder,
  subtitle,
  disabled = false,
  error,
  style,
}: AccountCardSelectProps) {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const styles = useThemedStyles(createStyles)

  return (
    <View style={style}>
      <TouchableOpacity
        style={[styles.cardSelectRow, disabled && styles.disabled]}
        activeOpacity={0.7}
        onPress={onPress}
        disabled={disabled}
      >
        <View style={styles.cardSelectLeft}>
          <View style={styles.cardSelectIconWrap}>
            <AccountIcon
              account={account}
              institution={institution}
              size={20}
              color={account ? colors.primary : colors.textMuted}
            />
          </View>
          <View style={styles.cardSelectTextCol}>
            <Text
              style={[
                styles.cardSelectTitle,
                !account && styles.cardSelectPlaceholder,
              ]}
              numberOfLines={1}
            >
              {account
                ? account.name
                : (placeholder ??
                  t("finance.budgets.mobile.anyAccountPlaceholder"))}
            </Text>
            <Text style={styles.cardSelectSubtitle} numberOfLines={1}>
              {account
                ? t("finance.pickers.account.cardAccountSubtitle", {
                    currency: account.currency,
                    type: getLocalizedEnumLabel(
                      "finance",
                      "accountType",
                      account.type,
                      locale
                    ),
                  })
                : subtitle || t("finance.pickers.account.cardDefaultSubtitle")}
            </Text>
          </View>
        </View>
        <ChevronRight size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {error ? (
        <View style={styles.errorRow}>
          <AlertCircle size={12} color={colors.destructive} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  iconContainer: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  disabled: {
    opacity: 0.5,
  },
  cardSelectRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 8,
  },
  cardSelectLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
  },
  cardSelectIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  cardSelectTextCol: {
    flex: 1,
    gap: 2,
  },
  cardSelectTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  cardSelectSubtitle: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  cardSelectPlaceholder: {
    color: t.colors.textMuted,
  },
  errorRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
    marginTop: -2,
  },
  errorText: {
    fontSize: 12,
    color: t.colors.destructive,
    fontWeight: "500" as const,
  },
})

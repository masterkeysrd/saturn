import React, { useState } from "react"
import {
  StyleSheet,
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
} from "lucide-react-native"
import {
  type Account,
  type Account_InstitutionInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { getInstitutionLogoUrl } from "@saturn/core"
import { theme } from "@/lib/theme"
import { formStyles } from "./forms/form-styles"

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
  color = theme.colors.textMuted,
  fallbackIcon,
  style,
}: AccountIconProps) {
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
        <Landmark size={size} color={color} />
      </View>
    )
  }

  const renderIcon = () => {
    switch (account.type) {
      case "CREDIT_CARD":
        return <CreditCard size={size} color={color} />
      case "CASH":
        return <Coins size={size} color={color} />
      case "DIGITAL_ACCOUNT":
        return <Wallet size={size} color={color} />
      default:
        return <Landmark size={size} color={color} />
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
  accountId?: string
  accounts?: Account[]
  institution?: Account_InstitutionInfo
  onPress: () => void
  label?: string
  placeholder?: string
  fallbackIcon?: React.ReactNode
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

export function AccountRow({
  account,
  accountId,
  accounts,
  institution,
  onPress,
  label = "Account",
  placeholder = "No Account (Cash)",
  fallbackIcon,
  disabled = false,
  style,
}: AccountRowProps) {
  const resolvedAccount =
    account ??
    (accountId && accounts
      ? accounts.find((a) => a.id === accountId)
      : undefined)

  return (
    <TouchableOpacity
      style={[formStyles.formRow, disabled && styles.disabled, style]}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={formStyles.formRowLabelGroup}>
        <AccountIcon
          account={resolvedAccount}
          institution={institution}
          size={16}
          color={theme.colors.textMuted}
          fallbackIcon={fallbackIcon}
        />
        <Text style={formStyles.formRowLabel}>{label}</Text>
      </View>
      <View style={formStyles.formRowValueGroup}>
        <Text
          style={[
            formStyles.formRowValueText,
            !resolvedAccount && formStyles.placeholderText,
          ]}
          numberOfLines={1}
        >
          {resolvedAccount
            ? `${resolvedAccount.name} (${resolvedAccount.currency})`
            : placeholder}
        </Text>
        <ChevronRight size={14} color={theme.colors.textMuted} />
      </View>
    </TouchableOpacity>
  )
}

export interface AccountCardSelectProps {
  account?: Account | null
  accountId?: string
  accounts?: Account[]
  institution?: Account_InstitutionInfo
  onPress: () => void
  placeholder?: string
  subtitle?: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

export function AccountCardSelect({
  account,
  accountId,
  accounts,
  institution,
  onPress,
  placeholder = "None (Any Account)",
  subtitle,
  disabled = false,
  style,
}: AccountCardSelectProps) {
  const resolvedAccount =
    account ??
    (accountId && accounts
      ? accounts.find((a) => a.id === accountId)
      : undefined)

  return (
    <TouchableOpacity
      style={[styles.cardSelectRow, disabled && styles.disabled, style]}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.cardSelectLeft}>
        <View style={styles.cardSelectIconWrap}>
          <AccountIcon
            account={resolvedAccount}
            institution={institution}
            size={20}
            color={
              resolvedAccount ? theme.colors.primary : theme.colors.textMuted
            }
          />
        </View>
        <View style={styles.cardSelectTextCol}>
          <Text
            style={[
              styles.cardSelectTitle,
              !resolvedAccount && styles.cardSelectPlaceholder,
            ]}
            numberOfLines={1}
          >
            {resolvedAccount ? resolvedAccount.name : placeholder}
          </Text>
          <Text style={styles.cardSelectSubtitle} numberOfLines={1}>
            {resolvedAccount
              ? `${resolvedAccount.currency} • ${resolvedAccount.type.replace(/_/g, " ")}`
              : subtitle || "Default linked payment method"}
          </Text>
        </View>
      </View>
      <ChevronRight size={16} color={theme.colors.textMuted} />
    </TouchableOpacity>
  )
}

export interface AccountSelectProps {
  value?: string
  account?: Account | null
  accounts?: Account[]
  institutions?: Account_InstitutionInfo[]
  onPress: () => void
  variant?: "row" | "card"
  label?: string
  placeholder?: string
  noAccountLabel?: string
  noAccountSubtitle?: string
  fallbackIcon?: React.ReactNode
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

export function AccountSelect({
  value,
  account,
  accounts,
  institutions,
  onPress,
  variant = "row",
  label = "Account",
  placeholder,
  noAccountLabel,
  noAccountSubtitle,
  fallbackIcon,
  disabled = false,
  style,
}: AccountSelectProps) {
  const resolvedAccount =
    account ??
    (value && accounts ? accounts.find((a) => a.id === value) : undefined)

  const inst =
    resolvedAccount?.institution ||
    (resolvedAccount?.institutionId && institutions
      ? institutions.find((i) => i.id === resolvedAccount.institutionId)
      : undefined)

  if (variant === "card") {
    return (
      <AccountCardSelect
        account={resolvedAccount}
        institution={inst}
        onPress={onPress}
        placeholder={noAccountLabel || placeholder || "None (Any Account)"}
        subtitle={noAccountSubtitle}
        disabled={disabled}
        style={style}
      />
    )
  }

  return (
    <AccountRow
      account={resolvedAccount}
      institution={inst}
      onPress={onPress}
      label={label}
      placeholder={noAccountLabel || placeholder || "No Account (Cash)"}
      fallbackIcon={fallbackIcon}
      disabled={disabled}
      style={style}
    />
  )
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  cardSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  cardSelectLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  cardSelectIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cardSelectTextCol: {
    flex: 1,
    gap: 2,
  },
  cardSelectTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  cardSelectSubtitle: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  cardSelectPlaceholder: {
    color: theme.colors.textMuted,
  },
})

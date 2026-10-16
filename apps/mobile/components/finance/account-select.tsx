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
  AlertCircle,
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
  label = "Account",
  placeholder = "No Account (Cash)",
  fallbackIcon,
  disabled = false,
  error,
  style,
}: AccountRowProps) {
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
            color={theme.colors.textMuted}
            fallbackIcon={fallbackIcon}
          />
          <Text style={formStyles.formRowLabel}>{label}</Text>
        </View>
        <View style={formStyles.formRowValueGroup}>
          <Text
            style={[
              formStyles.formRowValueText,
              !account && formStyles.placeholderText,
            ]}
            numberOfLines={1}
          >
            {account ? `${account.name} (${account.currency})` : placeholder}
          </Text>
          <ChevronRight size={14} color={theme.colors.textMuted} />
        </View>
      </TouchableOpacity>
      {error ? (
        <View style={styles.errorRow}>
          <AlertCircle size={12} color={theme.colors.destructive} />
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
  placeholder = "None (Any Account)",
  subtitle,
  disabled = false,
  error,
  style,
}: AccountCardSelectProps) {
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
              color={account ? theme.colors.primary : theme.colors.textMuted}
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
              {account ? account.name : placeholder}
            </Text>
            <Text style={styles.cardSelectSubtitle} numberOfLines={1}>
              {account
                ? `${account.currency} • ${account.type.replace(/_/g, " ")}`
                : subtitle || "Default linked payment method"}
            </Text>
          </View>
        </View>
        <ChevronRight size={16} color={theme.colors.textMuted} />
      </TouchableOpacity>
      {error ? (
        <View style={styles.errorRow}>
          <AlertCircle size={12} color={theme.colors.destructive} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
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
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
    marginTop: -2,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
    fontWeight: "500",
  },
})

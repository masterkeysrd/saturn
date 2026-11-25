import { useEffect, useMemo, useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { useQueryClient } from "@tanstack/react-query"
import {
  buildReadableFieldEntries,
  describeToolCall,
  formatCurrencyCents,
  formatToolDateValue,
  formatToolTimeRange,
  humanizeFieldLabel,
  isPlainRecord,
  stripHtmlTags,
} from "@saturn/core"
import type {
  ListAccountsResponse,
  ListBudgetsResponse,
} from "@saturn/api/saturn/finance/v1/finance"
import type { PendingToolApproval } from "@saturn/api/saturn/platform/ai/v1/ai"
import { useI18n, useTimezone, type UseI18nResult } from "@saturn/hooks"
import {
  AlertTriangle,
  Calendar,
  Check,
  Mail,
  MapPin,
  ShieldAlert,
  Workflow,
  X,
} from "lucide-react-native"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../lib/theme"
import { haptics } from "../../lib/haptics"
import { Badge } from "../ui/badge"
import { JsonCodeBlock } from "../ui/json-code-block"
import { MonoAmount } from "../ui/typography"
import { getToolDomainLabelKey } from "./tool-domain-label"

interface ToolApprovalCardProps {
  approval: PendingToolApproval
  onApprove: (toolCallId: string) => void
  onReject: (toolCallId: string) => void
}

function asString(val: unknown): string | undefined {
  return typeof val === "string" && val.trim() ? val.trim() : undefined
}

function asNumber(val: unknown): number | undefined {
  return typeof val === "number" && Number.isFinite(val) ? val : undefined
}

function asStringArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }
  if (typeof val === "string" && val.trim()) {
    return val
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function resolveAccountFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  accountId?: string
): { name: string; currency?: string } | undefined {
  if (!accountId) return undefined
  const cached = queryClient.getQueriesData<ListAccountsResponse>({
    queryKey: ["/api/v1/finance/accounts"],
  })
  for (const [, data] of cached) {
    const match = data?.accounts?.find((acc) => acc.id === accountId)
    if (match?.name) {
      return { name: match.name, currency: match.currency }
    }
  }
  return undefined
}

function resolveBudgetNameFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  budgetId?: string
): string | undefined {
  if (!budgetId) return undefined
  const cached = queryClient.getQueriesData<ListBudgetsResponse>({
    queryKey: ["/api/v1/finance/budgets"],
  })
  for (const [, data] of cached) {
    const match = data?.budgets?.find((b) => b.id === budgetId)
    if (match?.name) {
      return match.name
    }
  }
  return undefined
}

function formatScopeLabel(
  scope: string | undefined,
  t: UseI18nResult["t"]
): string | undefined {
  if (!scope) return undefined
  switch (scope.toUpperCase()) {
    case "THIS_EVENT":
      return t("ai.approval.scopeThis")
    case "THIS_AND_FOLLOWING":
      return t("ai.approval.scopeFollowing")
    case "ALL_EVENTS":
      return t("ai.approval.scopeAll")
    default:
      return humanizeFieldLabel(scope)
  }
}

export function ToolApprovalCard({
  approval,
  onApprove,
  onReject,
}: ToolApprovalCardProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()
  const tz = useTimezone()
  const queryClient = useQueryClient()
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    haptics.warning()
  }, [])

  const callId = approval.toolCallId ?? ""
  const toolName = approval.toolName ?? "tool"
  const args = approval.arguments
  const hasArgs = Boolean(args) && Object.keys(args ?? {}).length > 0

  const desc = describeToolCall({
    toolName,
    mcpServerName: approval.mcpServerName,
    arguments: args,
  })
  const domainLabel =
    desc.domain === "mcp"
      ? desc.domainLabel
      : t(getToolDomainLabelKey(desc.domain))
  const approvalAria = (action: string) =>
    t("ai.chatMobile.approvalAria", {
      action,
      tool: approval.toolName ?? "",
    })

  const booleanLabels = useMemo(
    () => ({ yes: t("ai.formatters.yes"), no: t("ai.formatters.no") }),
    [t]
  )

  const renderMetaRow = (
    key: string,
    label: string,
    value: string,
    isMono = false
  ) => (
    <View key={key} style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text
        style={[styles.metaValue, isMono && styles.metaMono]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  )

  const renderPreviewContent = () => {
    if (!args || Object.keys(args).length === 0) return null

    if (
      toolName === "finance_create_transaction" ||
      toolName === "finance_create_expense" ||
      toolName === "finance_update_transaction" ||
      toolName === "finance_log_borrowing_payment"
    ) {
      const txType = (
        asString(args.type) ??
        (toolName === "finance_create_expense" ? "EXPENSE" : "TRANSACTION")
      ).toUpperCase()
      const cents =
        asNumber(args.amount_cents) ??
        asNumber(args.amountCents) ??
        asNumber(args.amount)
      const currency = asString(args.currency)?.toUpperCase()
      const description = asString(args.description)
      const txDate = asString(args.transaction_date) ?? asString(args.date)
      const budgetId = asString(args.budget_id)
      const accountId = asString(args.account_id)
      const budgetName = resolveBudgetNameFromCache(queryClient, budgetId)
      const accountInfo = resolveAccountFromCache(queryClient, accountId)
      const resolvedCurrency = currency ?? accountInfo?.currency ?? "USD"

      const remaining = buildReadableFieldEntries(
        args,
        tz,
        new Set([
          "type",
          "amount_cents",
          "amountCents",
          "amount",
          "currency",
          "description",
          "transaction_date",
          "date",
          "budget_id",
          "account_id",
        ]),
        booleanLabels
      )

      return (
        <View style={styles.previewBody}>
          <View style={styles.highlightRow}>
            <View style={styles.highlightLeft}>
              <Badge
                size="sm"
                variant={txType === "INCOME" ? "success" : "destructive"}
                label={txType}
              />
              {description ? (
                <Text style={styles.highlightTitle} numberOfLines={1}>
                  {description}
                </Text>
              ) : null}
            </View>
            {cents !== undefined ? (
              <MonoAmount size="md">
                {formatCurrencyCents(cents, resolvedCurrency)}
              </MonoAmount>
            ) : null}
          </View>

          {txDate || budgetId || accountId || remaining.length > 0 ? (
            <View style={styles.metaGroup}>
              {txDate
                ? renderMetaRow(
                    "date",
                    t("ai.preview.date"),
                    formatToolDateValue(txDate, tz)
                  )
                : null}
              {budgetId
                ? renderMetaRow(
                    "budget",
                    t("ai.preview.budget"),
                    budgetName ?? budgetId,
                    !budgetName
                  )
                : null}
              {accountId
                ? renderMetaRow(
                    "account",
                    t("ai.preview.account"),
                    accountInfo?.name ?? accountId,
                    !accountInfo
                  )
                : null}
              {remaining.map((entry) =>
                renderMetaRow(
                  entry.key,
                  entry.label,
                  entry.displayValue,
                  entry.isMono
                )
              )}
            </View>
          ) : null}
        </View>
      )
    }

    if (toolName === "finance_create_transfer") {
      const sourceId = asString(args.source_account_id)
      const destId = asString(args.destination_account_id)
      const sourceInfo = resolveAccountFromCache(queryClient, sourceId)
      const destInfo = resolveAccountFromCache(queryClient, destId)
      const sourceCents = asNumber(args.source_amount_cents)
      const destCents = asNumber(args.destination_amount_cents)
      const transferDate = asString(args.transfer_date)
      const notes = asString(args.notes)

      return (
        <View style={styles.previewBody}>
          <View style={styles.highlightRow}>
            <Badge
              size="sm"
              variant="primary"
              label={t("ai.preview.transfer")}
            />
            {sourceCents !== undefined ? (
              <MonoAmount size="md">
                {formatCurrencyCents(sourceCents, sourceInfo?.currency)}
                {destCents !== undefined && destCents !== sourceCents
                  ? ` → ${formatCurrencyCents(destCents, destInfo?.currency)}`
                  : ""}
              </MonoAmount>
            ) : null}
          </View>

          <View style={styles.metaGroup}>
            {sourceId
              ? renderMetaRow(
                  "from",
                  t("ai.preview.fromAccount"),
                  sourceInfo?.name ?? sourceId,
                  !sourceInfo
                )
              : null}
            {destId
              ? renderMetaRow(
                  "to",
                  t("ai.preview.toAccount"),
                  destInfo?.name ?? destId,
                  !destInfo
                )
              : null}
            {transferDate
              ? renderMetaRow(
                  "date",
                  t("ai.preview.date"),
                  formatToolDateValue(transferDate, tz)
                )
              : null}
            {notes
              ? renderMetaRow("notes", t("ai.preview.notes"), notes)
              : null}
          </View>
        </View>
      )
    }

    if (toolName === "finance_create_inbox_item") {
      const docType = (asString(args.doc_type) ?? "RECEIPT").toUpperCase()
      const vendor = asString(args.vendor) ?? asString(args.vendor_name)
      const cents = asNumber(args.amount_cents)
      const currency = asString(args.currency)?.toUpperCase()
      const dateStr = asString(args.date)
      const accountId = asString(args.account_id)
      const accountInfo = resolveAccountFromCache(queryClient, accountId)
      const suggestedBudget = asString(args.suggested_budget)
      const budgetName = resolveBudgetNameFromCache(
        queryClient,
        suggestedBudget
      )

      return (
        <View style={styles.previewBody}>
          <View style={styles.highlightRow}>
            <View style={styles.highlightLeft}>
              <Badge size="sm" variant="default" label={docType} />
              {vendor ? (
                <Text style={styles.highlightTitle} numberOfLines={1}>
                  {vendor}
                </Text>
              ) : null}
            </View>
            {cents !== undefined ? (
              <MonoAmount size="md">
                {formatCurrencyCents(
                  cents,
                  currency ?? accountInfo?.currency ?? "USD"
                )}
              </MonoAmount>
            ) : null}
          </View>

          {dateStr || accountId || suggestedBudget ? (
            <View style={styles.metaGroup}>
              {dateStr
                ? renderMetaRow(
                    "date",
                    t("ai.preview.date"),
                    formatToolDateValue(dateStr, tz)
                  )
                : null}
              {accountId
                ? renderMetaRow(
                    "account",
                    t("ai.preview.account"),
                    accountInfo?.name ?? accountId,
                    !accountInfo
                  )
                : null}
              {suggestedBudget
                ? renderMetaRow(
                    "suggestedBudget",
                    t("ai.preview.suggestedBudget"),
                    budgetName ?? suggestedBudget
                  )
                : null}
            </View>
          ) : null}
        </View>
      )
    }

    if (
      toolName === "mail_send_message" ||
      toolName === "mail_create_draft" ||
      toolName === "mail_update_draft"
    ) {
      const draftId = asString(args.draft_id)
      const toList = asStringArray(args.to)
      const ccList = asStringArray(args.cc)
      const bccList = asStringArray(args.bcc)
      const subject = asString(args.subject)
      const rawBody =
        asString(args.body_text) ??
        (asString(args.body_html)
          ? stripHtmlTags(asString(args.body_html)!)
          : undefined)
      const snippet =
        rawBody && rawBody.length > 220 ? `${rawBody.slice(0, 220)}…` : rawBody
      const mode = asString(args.mode)

      return (
        <View style={styles.previewBody}>
          {draftId
            ? renderMetaRow("draftId", t("ai.preview.draftId"), draftId, true)
            : null}
          {toList.length > 0 ? (
            <View style={styles.chipRow}>
              <Text style={styles.metaLabel}>{t("ai.preview.to")}</Text>
              {toList.map((addr) => (
                <Badge key={addr} size="sm" variant="default" label={addr} />
              ))}
            </View>
          ) : null}
          {ccList.length > 0 ? (
            <View style={styles.chipRow}>
              <Text style={styles.metaLabel}>{t("ai.preview.cc")}</Text>
              {ccList.map((addr) => (
                <Badge key={addr} size="sm" variant="outline" label={addr} />
              ))}
            </View>
          ) : null}
          {bccList.length > 0 ? (
            <View style={styles.chipRow}>
              <Text style={styles.metaLabel}>{t("ai.preview.bcc")}</Text>
              {bccList.map((addr) => (
                <Badge key={addr} size="sm" variant="outline" label={addr} />
              ))}
            </View>
          ) : null}
          {subject ? (
            <View style={styles.subjectRow}>
              <Mail size={13} color={colors.accent} />
              <Text style={styles.highlightTitle} numberOfLines={2}>
                {subject}
              </Text>
              {mode && mode !== "new" ? (
                <Badge
                  size="sm"
                  variant="outline"
                  label={humanizeFieldLabel(mode)}
                />
              ) : null}
            </View>
          ) : null}
          {snippet ? <Text style={styles.bodySnippet}>{snippet}</Text> : null}
        </View>
      )
    }

    if (toolName === "mail_archive_thread") {
      const threadId = asString(args.id)
      return (
        <View style={styles.previewBody}>
          <Text style={styles.bodySnippet}>
            {t("ai.preview.archiveThreadDesc")}
          </Text>
          {threadId
            ? renderMetaRow(
                "threadId",
                t("ai.preview.threadId"),
                threadId,
                true
              )
            : null}
        </View>
      )
    }

    if (
      toolName === "calendar_create_event" ||
      toolName === "calendar_update_event"
    ) {
      const title = asString(args.title)
      const isAllDay = Boolean(
        args.is_all_day || (args.start_date && !args.start_time)
      )
      const range = formatToolTimeRange(tz, {
        isAllDay,
        startTime: asString(args.start_time),
        endTime: asString(args.end_time),
        startDate: asString(args.start_date),
        endDate: asString(args.end_date),
      })
      const location = asString(args.location)
      const attendees = asStringArray(args.attendees)
      const description = asString(args.description)
      const eventId = asString(args.id)
      const calendarId = asString(args.calendar_id)

      return (
        <View style={styles.previewBody}>
          <View style={styles.highlightRow}>
            {title ? (
              <View style={styles.highlightLeft}>
                <Calendar size={14} color={colors.primary} />
                <Text style={styles.highlightTitle} numberOfLines={2}>
                  {title}
                </Text>
              </View>
            ) : null}
            {isAllDay ? (
              <Badge
                size="sm"
                variant="default"
                label={t("ai.preview.allDay")}
              />
            ) : null}
          </View>

          <View style={styles.metaGroup}>
            {range ? renderMetaRow("when", t("ai.preview.when"), range) : null}
            {location ? (
              <View style={styles.metaRow}>
                <View style={styles.iconLabel}>
                  <MapPin size={12} color={colors.textMuted} />
                  <Text style={styles.metaLabel}>
                    {t("ai.preview.location")}
                  </Text>
                </View>
                <Text style={styles.metaValue} numberOfLines={2}>
                  {location}
                </Text>
              </View>
            ) : null}
            {attendees.length > 0 ? (
              <View style={styles.chipRow}>
                <Text style={styles.metaLabel}>
                  {t("ai.preview.attendees")}
                </Text>
                {attendees.map((att) => (
                  <Badge key={att} size="sm" variant="outline" label={att} />
                ))}
              </View>
            ) : null}
            {eventId
              ? renderMetaRow("eventId", t("ai.preview.eventId"), eventId, true)
              : null}
            {calendarId
              ? renderMetaRow(
                  "calendarId",
                  t("ai.preview.calendar"),
                  calendarId,
                  true
                )
              : null}
            {description ? (
              <Text style={styles.bodySnippet}>{description}</Text>
            ) : null}
          </View>
        </View>
      )
    }

    if (toolName === "calendar_delete_event") {
      const eventId = asString(args.id)
      const scope = formatScopeLabel(asString(args.scope), t)
      return (
        <View style={styles.previewBody}>
          <View style={styles.warningRow}>
            <AlertTriangle size={14} color={colors.destructive} />
            <Text style={styles.destructiveText}>
              {t("ai.approval.deleteEventWarning")}
            </Text>
          </View>
          <View style={styles.metaGroup}>
            {eventId
              ? renderMetaRow("eventId", t("ai.preview.eventId"), eventId, true)
              : null}
            {scope
              ? renderMetaRow("scope", t("ai.preview.scope"), scope)
              : null}
          </View>
        </View>
      )
    }

    if (toolName === "workflows_execute_flow") {
      const flowId = asString(args.id)
      const isAsync = Boolean(args.async)
      const inputObj = isPlainRecord(args.input) ? args.input : undefined
      const inputEntries = inputObj
        ? buildReadableFieldEntries(inputObj, tz, new Set(), booleanLabels)
        : []

      return (
        <View style={styles.previewBody}>
          <View style={styles.highlightRow}>
            <View style={styles.highlightLeft}>
              <Workflow size={14} color={colors.warning} />
              <Text style={styles.highlightTitle}>
                {t("ai.approval.executeWorkflow")}
              </Text>
            </View>
            {isAsync ? (
              <Badge
                size="sm"
                variant="default"
                label={t("ai.preview.async")}
              />
            ) : null}
          </View>
          <View style={styles.metaGroup}>
            {flowId
              ? renderMetaRow(
                  "workflow",
                  t("ai.preview.workflow"),
                  flowId,
                  true
                )
              : null}
            {inputEntries.map((entry) =>
              renderMetaRow(
                entry.key,
                entry.label,
                entry.displayValue,
                entry.isMono
              )
            )}
          </View>
        </View>
      )
    }

    const entries = buildReadableFieldEntries(
      args,
      tz,
      new Set(),
      booleanLabels
    )
    if (entries.length === 0) return null

    return (
      <View style={styles.metaGroup}>
        {entries.map((entry) =>
          renderMetaRow(
            entry.key,
            entry.label,
            entry.displayValue,
            entry.isMono
          )
        )}
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ShieldAlert size={16} color={colors.warning} />
        <Text style={styles.title}>
          {t("ai.chatMobile.confirmTool", {
            tool: desc.label,
            domain: domainLabel,
          })}
        </Text>
      </View>

      <Text style={styles.toolLine}>
        <Text style={styles.toolName}>{approval.toolName}</Text>
        {approval.mcpServerName ? (
          <Text style={styles.serverName}>
            {" "}
            {t("ai.conversation.via", { server: approval.mcpServerName })}
          </Text>
        ) : null}
        {desc.summary ? (
          <Text style={styles.serverName}> · {desc.summary}</Text>
        ) : null}
      </Text>

      {hasArgs ? (
        <View style={styles.previewSection}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewLabel}>
              {t("ai.preview.actionPreview")}
            </Text>
            <TouchableOpacity
              testID="approval-raw-toggle"
              style={[styles.rawToggle, showRaw && styles.rawToggleActive]}
              onPress={() => {
                haptics.selection()
                setShowRaw((prev) => !prev)
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={t("ai.approval.toggleRaw")}
            >
              <Text
                style={[
                  styles.rawToggleText,
                  showRaw && styles.rawToggleTextActive,
                ]}
              >
                {showRaw ? t("ai.code.structuredToggle") : t("ai.preview.raw")}
              </Text>
            </TouchableOpacity>
          </View>

          {showRaw ? (
            <JsonCodeBlock
              value={args}
              maxHeight={220}
              testID="approval-raw-json"
            />
          ) : (
            renderPreviewContent()
          )}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.rejectBtn]}
          onPress={() => {
            haptics.light()
            onReject(callId)
          }}
          accessibilityRole="button"
          accessibilityLabel={approvalAria(t("ai.conversation.reject"))}
        >
          <X size={14} color={colors.textSecondary} />
          <Text style={styles.rejectText}>{t("ai.conversation.reject")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.approveBtn]}
          onPress={() => {
            haptics.success()
            onApprove(callId)
          }}
          accessibilityRole="button"
          accessibilityLabel={approvalAria(t("ai.conversation.approve"))}
        >
          <Check size={14} color={colors.primaryForeground} />
          <Text style={styles.approveText}>{t("ai.conversation.approve")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  card: {
    backgroundColor: t.colors.warningSubtle,
    borderWidth: 1,
    borderColor: t.colors.warning,
    borderRadius: t.radius.lg,
    padding: 12,
    gap: 8,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  toolLine: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },
  toolName: {
    fontFamily: t.typography.mono,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  serverName: {
    color: t.colors.textMuted,
  },
  previewSection: {
    borderTopWidth: 1,
    borderTopColor: t.colors.warningBorder,
    paddingTop: 8,
    gap: 6,
  },
  previewHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.7,
    textTransform: "uppercase" as const,
    color: t.colors.textMuted,
  },
  rawToggle: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  rawToggleActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  rawToggleText: {
    fontSize: 11,
    fontFamily: t.typography.mono,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  rawToggleTextActive: {
    color: t.colors.primary,
  },
  previewBody: {
    gap: 6,
  },
  highlightRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  highlightLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  highlightTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  metaGroup: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingTop: 2,
  },
  metaRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    justifyContent: "space-between" as const,
    gap: 10,
    paddingVertical: 4,
  },
  iconLabel: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  metaLabel: {
    fontSize: 11,
    color: t.colors.textMuted,
    flexShrink: 0,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textPrimary,
    textAlign: "right" as const,
    flexShrink: 1,
  },
  metaMono: {
    fontFamily: t.typography.mono,
    fontSize: 11,
  },
  chipRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    alignItems: "center" as const,
    gap: 5,
    paddingVertical: 2,
  },
  subjectRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingTop: 6,
  },
  bodySnippet: {
    fontSize: 12,
    lineHeight: 17,
    color: t.colors.textSecondary,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    paddingTop: 6,
  },
  warningRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  destructiveText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.destructive,
    flexShrink: 1,
  },
  actions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 8,
  },
  btn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: t.radius.md,
  },
  rejectBtn: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  rejectText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  approveBtn: {
    backgroundColor: t.colors.primary,
  },
  approveText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.primaryForeground,
  },
})

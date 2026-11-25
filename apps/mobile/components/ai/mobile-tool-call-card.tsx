import { useMemo, useState } from "react"
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native"
import { useRouter } from "expo-router"
import {
  buildReadableFieldEntries,
  describeToolCall,
  extractToolErrorMessage,
  formatCurrencyCents,
  formatToolDateValue,
  formatToolDuration,
  formatToolTimeRange,
  humanizeFieldLabel,
  isPlainRecord,
  unwrapToolResult,
  type ToolDomain,
} from "@saturn/core"
import { useI18n, useTimezone } from "@saturn/hooks"
import {
  AlertCircle,
  Bot,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Landmark,
  Layers,
  Mail,
  Plug,
  Workflow,
  Wrench,
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

export interface MobileToolCallInput {
  id?: string
  callId?: string
  toolName: string
  mcpServerName?: string
  arguments?: Record<string, unknown>
}

export interface MobileToolResultEntry {
  result?: unknown
  isError?: boolean
  errorText?: string
}

export interface MobileToolCallCardProps {
  toolCall: MobileToolCallInput
  resultEntry?: MobileToolResultEntry
  isRunning?: boolean
  durationMs?: number
  testID?: string
}

function asStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined
}

function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() && /^-?\d+(?:\.\d+)?$/.test(v.trim())) {
    const parsed = Number(v.trim())
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function asRecords(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return []
  return v.filter((item): item is Record<string, unknown> =>
    isPlainRecord(item)
  )
}

function getDomainColor(
  domain: ToolDomain,
  colors: SaturnMobileTheme["colors"]
): string {
  switch (domain) {
    case "finance":
      return colors.success
    case "calendar":
      return colors.primary
    case "mail":
      return colors.accent
    case "workflows":
      return colors.warning
    case "space":
      return colors.textSecondary
    case "agent":
      return colors.accent
    case "mcp":
      return colors.primary
    default:
      return colors.textMuted
  }
}

function DomainIcon({
  domain,
  size = 13,
}: {
  domain: ToolDomain
  size?: number
}) {
  const { colors } = useTheme()
  const color = getDomainColor(domain, colors)
  switch (domain) {
    case "finance":
      return <Landmark size={size} color={color} />
    case "calendar":
      return <Calendar size={size} color={color} />
    case "mail":
      return <Mail size={size} color={color} />
    case "workflows":
      return <Workflow size={size} color={color} />
    case "space":
      return <Layers size={size} color={color} />
    case "agent":
      return <Bot size={size} color={color} />
    case "mcp":
      return <Plug size={size} color={color} />
    default:
      return <Wrench size={size} color={color} />
  }
}

function getBudgetProgressColor(
  pct: number,
  colors: SaturnMobileTheme["colors"]
): string {
  if (pct >= 100) return colors.destructive
  if (pct >= 80) return colors.warning
  return colors.success
}

function statusBadgeVariant(
  status?: string
): "success" | "destructive" | "primary" | "default" {
  const lower = (status ?? "").toLowerCase()
  if (lower === "completed" || lower === "resolved" || lower === "settled") {
    return "success"
  }
  if (lower === "failed" || lower === "error") {
    return "destructive"
  }
  if (lower === "running" || lower === "processing") {
    return "primary"
  }
  return "default"
}

export function MobileToolCallCard({
  toolCall,
  resultEntry,
  isRunning = false,
  durationMs,
  testID,
}: MobileToolCallCardProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()
  const tz = useTimezone()
  const router = useRouter()

  const [expanded, setExpanded] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  const id = toolCall.callId ?? toolCall.id ?? toolCall.toolName
  const unwrapped = useMemo(
    () => unwrapToolResult(resultEntry?.result),
    [resultEntry?.result]
  )
  const descriptor = useMemo(
    () =>
      describeToolCall({
        toolName: toolCall.toolName,
        mcpServerName: toolCall.mcpServerName,
        arguments: toolCall.arguments,
        result: unwrapped,
      }),
    [toolCall.toolName, toolCall.mcpServerName, toolCall.arguments, unwrapped]
  )

  const booleanLabels = useMemo(
    () => ({ yes: t("ai.formatters.yes"), no: t("ai.formatters.no") }),
    [t]
  )

  const paramEntries = useMemo(() => {
    if (!toolCall.arguments) return []
    return buildReadableFieldEntries(
      toolCall.arguments,
      tz,
      new Set(),
      booleanLabels
    )
  }, [toolCall.arguments, tz, booleanLabels])

  const hasArgs =
    Boolean(toolCall.arguments) &&
    Object.keys(toolCall.arguments ?? {}).length > 0
  const hasResult =
    resultEntry !== undefined &&
    (resultEntry.result !== undefined || Boolean(resultEntry.errorText))
  const isError = Boolean(resultEntry?.isError)
  const isCompleted = !isRunning && resultEntry !== undefined && !isError
  const durationText = formatToolDuration(durationMs)

  const headerLabel = isRunning
    ? descriptor.activeLabel
    : isError
      ? descriptor.label
      : descriptor.completedLabel

  const domainLabel =
    descriptor.domain === "mcp"
      ? descriptor.domainLabel
      : t(getToolDomainLabelKey(descriptor.domain))

  const errorMessage = useMemo(() => {
    if (!isError) return undefined
    return (
      extractToolErrorMessage(resultEntry?.result, resultEntry?.errorText) ??
      t("ai.conversation.toolFailed")
    )
  }, [isError, resultEntry?.result, resultEntry?.errorText, t])

  const renderOverflowNote = (total: number, shown: number) => {
    if (total <= shown) return null
    return (
      <Text style={styles.overflowNote}>
        {t("ai.result.overflow", { n: total - shown })}
      </Text>
    )
  }

  const renderStructuredResult = () => {
    if (!unwrapped) return null
    const toolName = toolCall.toolName

    // --- Finance: Accounts ---
    if (
      toolName === "finance_list_accounts" ||
      toolName === "finance_accounts" ||
      Array.isArray(unwrapped.accounts)
    ) {
      const accounts = asRecords(unwrapped.accounts)
      if (accounts.length === 0) {
        return <Text style={styles.emptyNote}>{t("ai.result.noAccounts")}</Text>
      }
      const visible = accounts.slice(0, 6)
      return (
        <View style={styles.listSection}>
          {visible.map((acc, idx) => {
            const accId = asStr(acc.id)
            const name = asStr(acc.name) ?? t("ai.result.fallbacks.account")
            const type = asStr(acc.type)
            const curr = asStr(acc.currency)
            const balCents =
              asNum(acc.balance_cents) ??
              asNum(acc.current_balance) ??
              asNum(acc.balanceCents)
            const formattedBal =
              asStr(acc.formatted_balance) ??
              asStr(acc.formattedBalance) ??
              (balCents !== undefined
                ? formatCurrencyCents(balCents, curr)
                : "—")

            const rowContent = (
              <View
                style={[styles.domainRow, idx > 0 && styles.domainRowBorder]}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {name}
                  </Text>
                  {type ? (
                    <Badge
                      size="sm"
                      variant="outline"
                      label={humanizeFieldLabel(type)}
                    />
                  ) : null}
                </View>
                <MonoAmount size="sm">{formattedBal}</MonoAmount>
              </View>
            )

            if (accId) {
              return (
                <TouchableOpacity
                  key={accId}
                  onPress={() => {
                    haptics.selection()
                    router.push(`/(app)/finance/accounts/${accId}` as never)
                  }}
                  activeOpacity={0.7}
                >
                  {rowContent}
                </TouchableOpacity>
              )
            }
            return <View key={idx}>{rowContent}</View>
          })}
          {renderOverflowNote(accounts.length, visible.length)}
        </View>
      )
    }

    // --- Finance: Budgets ---
    if (
      toolName === "finance_list_budgets" ||
      toolName === "finance_budgets" ||
      Array.isArray(unwrapped.budgets)
    ) {
      const budgets = asRecords(unwrapped.budgets)
      if (budgets.length === 0) {
        return <Text style={styles.emptyNote}>{t("ai.result.noBudgets")}</Text>
      }
      const visible = budgets.slice(0, 6)
      return (
        <View style={styles.listSection}>
          {visible.map((b, idx) => {
            const bId = asStr(b.id)
            const name = asStr(b.name) ?? t("ai.result.fallbacks.budget")
            const curr = asStr(b.currency)
            const limitCents = asNum(b.limit_cents) ?? asNum(b.limitAmount) ?? 0
            const spentCents = asNum(b.spent_cents) ?? asNum(b.spentAmount) ?? 0
            const formattedSpent =
              asStr(b.formatted_spent) ?? formatCurrencyCents(spentCents, curr)
            const formattedLimit =
              asStr(b.formatted_limit) ?? formatCurrencyCents(limitCents, curr)
            const rawPct =
              asNum(b.usage_percent) ??
              asNum(b.usage_percentage) ??
              (limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0)
            const pct = Math.max(0, Math.round(rawPct))
            const barWidth = Math.min(100, pct)

            const rowContent = (
              <View
                style={[styles.budgetRow, idx > 0 && styles.domainRowBorder]}
              >
                <View style={styles.rowBetween}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {name}
                  </Text>
                  <View style={styles.budgetAmounts}>
                    <MonoAmount size="sm">{formattedSpent}</MonoAmount>
                    <Text style={styles.mutedMono}>/ </Text>
                    <MonoAmount size="sm" color={colors.textMuted}>
                      {formattedLimit}
                    </MonoAmount>
                  </View>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${barWidth}%`,
                        backgroundColor: getBudgetProgressColor(pct, colors),
                      },
                    ]}
                  />
                </View>
              </View>
            )

            if (bId) {
              return (
                <TouchableOpacity
                  key={bId}
                  onPress={() => {
                    haptics.selection()
                    router.push(`/(app)/finance/budgets/${bId}` as never)
                  }}
                  activeOpacity={0.7}
                >
                  {rowContent}
                </TouchableOpacity>
              )
            }
            return <View key={idx}>{rowContent}</View>
          })}
          {renderOverflowNote(budgets.length, visible.length)}
        </View>
      )
    }

    // --- Finance: Transactions ---
    if (
      toolName === "finance_list_transactions" ||
      toolName === "finance_create_transaction" ||
      toolName === "finance_create_expense" ||
      toolName === "finance_update_transaction" ||
      toolName === "finance_log_borrowing_payment" ||
      Array.isArray(unwrapped.transactions)
    ) {
      const txs =
        toolName === "finance_list_transactions" ||
        Array.isArray(unwrapped.transactions)
          ? asRecords(unwrapped.transactions)
          : [unwrapped]
      if (txs.length === 0) {
        return (
          <Text style={styles.emptyNote}>{t("ai.result.noTransactions")}</Text>
        )
      }
      const visible = txs.slice(0, 6)
      return (
        <View style={styles.listSection}>
          {visible.map((tx, idx) => {
            const txId = asStr(tx.id)
            const txType = (asStr(tx.type) ?? "EXPENSE").toUpperCase()
            const isIncome = txType === "INCOME" || txType === "TRANSFER_IN"
            const desc =
              asStr(tx.description) ?? t("ai.result.fallbacks.transaction")
            const curr = asStr(tx.currency)
            const cents = asNum(tx.amount_cents) ?? asNum(tx.amount)
            const formattedAmt =
              asStr(tx.formatted_amount) ??
              (cents !== undefined ? formatCurrencyCents(cents, curr) : "—")
            const dateStr =
              asStr(tx.effective_date) ?? asStr(tx.transaction_date)
            const budgetName = asStr(tx.budget_name)
            const accountName = asStr(tx.account_name)
            const signedAmt = `${isIncome ? "+" : "-"}${formattedAmt}`

            const rowContent = (
              <View
                style={[styles.domainRow, idx > 0 && styles.domainRowBorder]}
              >
                <View style={styles.rowCol}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {desc}
                  </Text>
                  {dateStr || budgetName || accountName ? (
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {[
                        dateStr ? formatToolDateValue(dateStr, tz) : undefined,
                        budgetName,
                        accountName,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  ) : null}
                </View>
                <MonoAmount
                  size="sm"
                  color={isIncome ? colors.success : colors.destructive}
                >
                  {signedAmt}
                </MonoAmount>
              </View>
            )

            if (txId) {
              return (
                <TouchableOpacity
                  key={txId}
                  onPress={() => {
                    haptics.selection()
                    router.push(`/(app)/finance/transactions/${txId}` as never)
                  }}
                  activeOpacity={0.7}
                >
                  {rowContent}
                </TouchableOpacity>
              )
            }
            return <View key={idx}>{rowContent}</View>
          })}
          {renderOverflowNote(txs.length, visible.length)}
        </View>
      )
    }

    // --- Finance: Insights ---
    if (
      toolName === "finance_get_insights" ||
      unwrapped.total_spent_cents !== undefined ||
      unwrapped.total_income_cents !== undefined ||
      isPlainRecord(unwrapped.spent) ||
      isPlainRecord(unwrapped.income)
    ) {
      const baseCurr = asStr(unwrapped.base_currency)
      const spentObj = isPlainRecord(unwrapped.spent)
        ? unwrapped.spent
        : undefined
      const incomeObj = isPlainRecord(unwrapped.income)
        ? unwrapped.income
        : undefined

      const spentCents =
        asNum(unwrapped.total_spent_cents) ??
        asNum(spentObj?.total_spent_cents) ??
        asNum(spentObj?.total_spent)
      const incomeCents =
        asNum(unwrapped.total_income_cents) ??
        asNum(incomeObj?.total_income_cents) ??
        asNum(incomeObj?.total_income)
      const remainingCents = asNum(unwrapped.remaining_budget_cents)
      const netCents =
        asNum(unwrapped.net_cents) ??
        (incomeCents !== undefined && spentCents !== undefined
          ? incomeCents - spentCents
          : undefined)

      const totalSpentStr =
        asStr(unwrapped.formatted_total_spent) ??
        (spentCents !== undefined
          ? formatCurrencyCents(spentCents, baseCurr)
          : undefined)
      const totalIncomeStr =
        asStr(unwrapped.formatted_total_income) ??
        (incomeCents !== undefined
          ? formatCurrencyCents(incomeCents, baseCurr)
          : undefined)
      const netStr =
        netCents !== undefined
          ? formatCurrencyCents(netCents, baseCurr)
          : undefined
      const remainingStr =
        asStr(unwrapped.formatted_remaining_budget) ??
        (remainingCents !== undefined
          ? formatCurrencyCents(remainingCents, baseCurr)
          : undefined)

      return (
        <View style={styles.kpiGrid}>
          {totalSpentStr ? (
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>{t("ai.result.totalExpense")}</Text>
              <MonoAmount size="sm" color={colors.destructive}>
                {totalSpentStr}
              </MonoAmount>
            </View>
          ) : null}
          {totalIncomeStr ? (
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>{t("ai.result.totalIncome")}</Text>
              <MonoAmount size="sm" color={colors.success}>
                {totalIncomeStr}
              </MonoAmount>
            </View>
          ) : null}
          {netStr ? (
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>
                {t("finance.transactions.net")}
              </Text>
              <MonoAmount size="sm" amount={netCents} colored>
                {netStr}
              </MonoAmount>
            </View>
          ) : null}
          {remainingStr ? (
            <View style={styles.kpiCell}>
              <Text style={styles.kpiLabel}>
                {t("ai.result.remainingBudget")}
              </Text>
              <MonoAmount size="sm">{remainingStr}</MonoAmount>
            </View>
          ) : null}
        </View>
      )
    }

    // --- Calendar: Events ---
    if (
      toolName === "calendar_list_events" ||
      toolName === "calendar_create_event" ||
      toolName === "calendar_update_event" ||
      Array.isArray(unwrapped.events)
    ) {
      const events =
        toolName === "calendar_list_events" || Array.isArray(unwrapped.events)
          ? asRecords(unwrapped.events)
          : [unwrapped]
      if (events.length === 0) {
        return <Text style={styles.emptyNote}>{t("ai.result.noEvents")}</Text>
      }
      const visible = events.slice(0, 6)
      return (
        <View style={styles.listSection}>
          {visible.map((ev, idx) => {
            const title =
              asStr(ev.title) ?? t("ai.result.fallbacks.untitledEvent")
            const isAllDay = Boolean(ev.is_all_day)
            const range = formatToolTimeRange(tz, {
              isAllDay,
              startTime: asStr(ev.start_time),
              endTime: asStr(ev.end_time),
              startDate: asStr(ev.start_date),
              endDate: asStr(ev.end_date),
            })
            const location = asStr(ev.location)
            return (
              <TouchableOpacity
                key={asStr(ev.event_id) ?? asStr(ev.id) ?? idx}
                style={[styles.eventRow, idx > 0 && styles.domainRowBorder]}
                onPress={() => {
                  haptics.selection()
                  router.push("/(app)/(tabs)/calendar" as never)
                }}
                activeOpacity={0.7}
              >
                <View style={styles.eventAccent} />
                <View style={styles.rowCol}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    {isAllDay ? (
                      <Badge
                        size="sm"
                        variant="default"
                        label={t("ai.preview.allDay")}
                      />
                    ) : null}
                  </View>
                  {range || location ? (
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {[range, location].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )
          })}
          {renderOverflowNote(events.length, visible.length)}
        </View>
      )
    }

    // --- Mail: List Threads ---
    if (toolName === "mail_list_threads" || Array.isArray(unwrapped.threads)) {
      const threads = asRecords(unwrapped.threads)
      if (threads.length === 0) {
        return <Text style={styles.emptyNote}>{t("ai.result.noThreads")}</Text>
      }
      const visible = threads.slice(0, 6)
      return (
        <View style={styles.listSection}>
          {visible.map((th, idx) => {
            const threadId = asStr(th.id)
            const subject = asStr(th.subject) ?? t("ai.result.noSubject")
            const snippet = asStr(th.snippet)
            const participants = Array.isArray(th.participants)
              ? th.participants
                  .filter((p): p is string => typeof p === "string")
                  .slice(0, 2)
                  .join(", ")
              : undefined
            const lastMsg = asStr(th.last_message_at)
            const content = (
              <View style={[styles.mailRow, idx > 0 && styles.domainRowBorder]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {subject}
                  </Text>
                  {lastMsg ? (
                    <Text style={styles.rowSub}>
                      {formatToolDateValue(lastMsg, tz)}
                    </Text>
                  ) : null}
                </View>
                {participants ? (
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {participants}
                  </Text>
                ) : null}
                {snippet ? (
                  <Text style={styles.rowSub} numberOfLines={2}>
                    {snippet}
                  </Text>
                ) : null}
              </View>
            )
            if (threadId) {
              return (
                <TouchableOpacity
                  key={threadId}
                  onPress={() => {
                    haptics.selection()
                    router.push(`/(app)/mail/${threadId}` as never)
                  }}
                  activeOpacity={0.7}
                >
                  {content}
                </TouchableOpacity>
              )
            }
            return <View key={idx}>{content}</View>
          })}
          {renderOverflowNote(threads.length, visible.length)}
        </View>
      )
    }

    // --- Mail: Get Thread / Messages ---
    if (toolName === "mail_get_thread" || Array.isArray(unwrapped.messages)) {
      const threadId = asStr(unwrapped.id) ?? asStr(unwrapped.thread_id)
      const subject = asStr(unwrapped.subject) ?? t("ai.result.noSubject")
      const messages = asRecords(unwrapped.messages)
      const visible = messages.slice(0, 4)

      const content = (
        <View style={styles.listSection}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {subject}
          </Text>
          {visible.map((m, idx) => {
            const from = asStr(m.from) ?? t("ai.result.fallbacks.unknownSender")
            const timestamp = asStr(m.timestamp)
            const body = asStr(m.body_plain) ?? asStr(m.snippet)
            return (
              <View
                key={asStr(m.id) ?? idx}
                style={[styles.mailRow, styles.domainRowBorder]}
              >
                <View style={styles.rowBetween}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {from}
                  </Text>
                  {timestamp ? (
                    <Text style={styles.rowSub}>
                      {formatToolDateValue(timestamp, tz)}
                    </Text>
                  ) : null}
                </View>
                {body ? (
                  <Text style={styles.rowSub} numberOfLines={3}>
                    {body}
                  </Text>
                ) : null}
              </View>
            )
          })}
          {renderOverflowNote(messages.length, visible.length)}
        </View>
      )

      if (threadId) {
        return (
          <TouchableOpacity
            onPress={() => {
              haptics.selection()
              router.push(`/(app)/mail/${threadId}` as never)
            }}
            activeOpacity={0.7}
          >
            {content}
          </TouchableOpacity>
        )
      }
      return content
    }

    // --- Mail: Single Draft / Sent Message / Mutation ---
    if (
      toolName === "mail_create_draft" ||
      toolName === "mail_update_draft" ||
      toolName === "mail_delete_draft" ||
      toolName === "mail_modify_thread" ||
      toolName === "mail_send_message" ||
      toolName === "mail_archive_thread"
    ) {
      const threadId = asStr(unwrapped.thread_id) ?? asStr(unwrapped.id)
      const subject = asStr(unwrapped.subject)
      const snippet = asStr(unwrapped.snippet) ?? asStr(unwrapped.body_plain)
      const recipients = Array.isArray(unwrapped.to)
        ? unwrapped.to.filter((r): r is string => typeof r === "string")
        : []
      const statusLabel =
        toolName === "mail_send_message"
          ? t("ai.result.mailStatus.sent")
          : toolName === "mail_create_draft"
            ? t("ai.result.mailStatus.draftCreated")
            : toolName === "mail_update_draft"
              ? t("ai.result.mailStatus.draftUpdated")
              : toolName === "mail_delete_draft"
                ? t("ai.result.mailStatus.draftDeleted")
                : toolName === "mail_modify_thread"
                  ? t("ai.result.mailStatus.updated")
                  : t("ai.result.mailStatus.archived")

      const body = (
        <View style={styles.listSection}>
          <View style={styles.rowBetween}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {subject ??
                (threadId
                  ? t("ai.result.thread", { id: threadId })
                  : t("ai.result.mailStatus.generic"))}
            </Text>
            <Badge size="sm" variant="default" label={statusLabel} />
          </View>
          {recipients.length > 0 ? (
            <Text style={styles.rowSub} numberOfLines={1}>
              {t("ai.result.to", { list: recipients.join(", ") })}
            </Text>
          ) : null}
          {snippet ? (
            <Text style={styles.rowSub} numberOfLines={2}>
              {snippet}
            </Text>
          ) : null}
        </View>
      )

      if (threadId && toolName !== "mail_delete_draft") {
        return (
          <TouchableOpacity
            onPress={() => {
              haptics.selection()
              router.push(`/(app)/mail/${threadId}` as never)
            }}
            activeOpacity={0.7}
          >
            {body}
          </TouchableOpacity>
        )
      }
      return body
    }

    // --- Workflows: Flows ---
    if (
      toolName === "workflows_list_flows" ||
      toolName === "workflows_set_flow_enabled" ||
      Array.isArray(unwrapped.flows)
    ) {
      const flows =
        toolName === "workflows_list_flows" || Array.isArray(unwrapped.flows)
          ? asRecords(unwrapped.flows)
          : [unwrapped]
      if (flows.length === 0) {
        return (
          <Text style={styles.emptyNote}>{t("ai.result.noWorkflows")}</Text>
        )
      }
      const visible = flows.slice(0, 6)
      return (
        <View style={styles.listSection}>
          {visible.map((f, idx) => {
            const name = asStr(f.name) ?? t("ai.result.fallbacks.workflow")
            const isEnabled = Boolean(f.is_enabled)
            const stepCount = asNum(f.step_count)
            const runs7d = asNum(f.total_runs_7d)
            return (
              <View
                key={asStr(f.id) ?? idx}
                style={[styles.domainRow, idx > 0 && styles.domainRowBorder]}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {name}
                  </Text>
                  <Badge
                    size="sm"
                    variant={isEnabled ? "success" : "outline"}
                    label={
                      isEnabled
                        ? t("ai.shared.enabled")
                        : t("ai.shared.disabled")
                    }
                  />
                </View>
                <Text style={styles.rowSub}>
                  {[
                    stepCount !== undefined
                      ? t("ai.result.stepsCount", { n: stepCount })
                      : undefined,
                    runs7d !== undefined
                      ? t("ai.result.runsCount", { n: runs7d })
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
            )
          })}
          {renderOverflowNote(flows.length, visible.length)}
        </View>
      )
    }

    // --- Workflows: Runs / FlowRun ---
    if (
      toolName === "workflows_get_flow_run" ||
      toolName === "workflows_execute_flow" ||
      toolName === "workflows_list_flow_runs" ||
      Array.isArray(unwrapped.runs)
    ) {
      const runs =
        toolName === "workflows_list_flow_runs" || Array.isArray(unwrapped.runs)
          ? asRecords(unwrapped.runs)
          : [unwrapped]
      const visible = runs.slice(0, 6)
      return (
        <View style={styles.listSection}>
          {visible.map((run, idx) => {
            const runId = asStr(run.id)
            const flowName =
              asStr(run.flow_name) ??
              asStr(run.flow_id) ??
              t("ai.result.fallbacks.run")
            const status = asStr(run.status)
            const createTime = asStr(run.create_time)
            const content = (
              <View style={[styles.mailRow, idx > 0 && styles.domainRowBorder]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {flowName}
                  </Text>
                  {status ? (
                    <Badge
                      size="sm"
                      variant={statusBadgeVariant(status)}
                      label={status.toLowerCase()}
                    />
                  ) : null}
                </View>
                {createTime ? (
                  <Text style={styles.rowSub}>
                    {t("ai.result.started", {
                      date: formatToolDateValue(createTime, tz),
                    })}
                  </Text>
                ) : null}
              </View>
            )
            if (runId) {
              return (
                <TouchableOpacity
                  key={runId}
                  onPress={() => {
                    haptics.selection()
                    router.push(`/(app)/workflows/runs/${runId}` as never)
                  }}
                  activeOpacity={0.7}
                >
                  {content}
                </TouchableOpacity>
              )
            }
            return <View key={idx}>{content}</View>
          })}
          {renderOverflowNote(runs.length, visible.length)}
        </View>
      )
    }

    // --- Generic Smart Fallback ---
    if (typeof unwrapped.text === "string" && unwrapped.text.trim()) {
      return (
        <Text style={styles.bodyText} selectable>
          {unwrapped.text.trim()}
        </Text>
      )
    }

    if (Array.isArray(unwrapped.items)) {
      const records = asRecords(unwrapped.items)
      if (records.length > 0) {
        const visible = records.slice(0, 5)
        return (
          <View style={styles.listSection}>
            {visible.map((item, idx) => {
              const entries = buildReadableFieldEntries(
                item,
                tz,
                new Set(),
                booleanLabels
              ).slice(0, 4)
              return (
                <View
                  key={asStr(item.id) ?? idx}
                  style={[styles.kvGroup, idx > 0 && styles.domainRowBorder]}
                >
                  {entries.map((e) => (
                    <View key={e.key} style={styles.kvRow}>
                      <Text style={styles.kvLabel}>{e.label}</Text>
                      <Text
                        style={[styles.kvValue, e.isMono && styles.kvMono]}
                        numberOfLines={2}
                      >
                        {e.displayValue}
                      </Text>
                    </View>
                  ))}
                </View>
              )
            })}
            {renderOverflowNote(records.length, visible.length)}
          </View>
        )
      }
    }

    const entries = buildReadableFieldEntries(
      unwrapped,
      tz,
      new Set(),
      booleanLabels
    )
    if (entries.length === 0) return null

    return (
      <View style={styles.listSection}>
        {entries.map((e, idx) => (
          <View
            key={e.key}
            style={[styles.kvRow, idx > 0 && styles.domainRowBorder]}
          >
            <Text style={styles.kvLabel}>{e.label}</Text>
            <Text
              style={[styles.kvValue, e.isMono && styles.kvMono]}
              selectable
            >
              {e.displayValue}
            </Text>
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={styles.wrapper} testID={testID}>
      <TouchableOpacity
        style={[
          styles.pill,
          isRunning && styles.pillActive,
          isError && styles.pillError,
        ]}
        onPress={() => {
          haptics.selection()
          setExpanded((prev) => !prev)
        }}
        activeOpacity={0.75}
        accessibilityRole="button"
      >
        <DomainIcon domain={descriptor.domain} />
        <Text style={styles.domainText}>{domainLabel}</Text>
        <Text style={styles.labelText} numberOfLines={1}>
          {headerLabel}
        </Text>
        {descriptor.summary ? (
          <View style={styles.summaryPill}>
            <Text style={styles.summaryText} numberOfLines={1}>
              {descriptor.summary}
            </Text>
          </View>
        ) : null}
        {durationText ? (
          <Text style={styles.durationText}>{durationText}</Text>
        ) : null}
        {isRunning ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : isError ? (
          <AlertCircle size={13} color={colors.destructive} />
        ) : isCompleted ? (
          <Check size={13} color={colors.success} />
        ) : null}
        {expanded ? (
          <ChevronDown size={13} color={colors.textMuted} />
        ) : (
          <ChevronRight size={13} color={colors.textMuted} />
        )}
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.topStrip}>
            <Text style={styles.toolCaption} numberOfLines={1}>
              {t("ai.domain.tool")}: {toolCall.toolName}
            </Text>
            <TouchableOpacity
              testID={`tool-raw-toggle-${id}`}
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
            <View style={styles.rawSections}>
              {hasArgs ? (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionLabel}>
                    {t("ai.code.parametersLabel")}
                  </Text>
                  <JsonCodeBlock
                    value={toolCall.arguments}
                    maxHeight={200}
                    testID={`tool-raw-args-${id}`}
                  />
                </View>
              ) : null}
              {hasResult ? (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionLabel}>
                    {t("ai.code.resultLabel")}
                  </Text>
                  <JsonCodeBlock
                    value={resultEntry?.result ?? resultEntry?.errorText}
                    maxHeight={240}
                    testID={`tool-raw-result-${id}`}
                  />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.formattedSections}>
              {paramEntries.length > 0 ? (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionLabel}>
                    {t("ai.code.parametersLabel")}
                  </Text>
                  <View style={styles.kvGroup}>
                    {paramEntries.map((entry, idx) => (
                      <View
                        key={entry.key}
                        style={[
                          styles.kvRow,
                          idx > 0 && styles.domainRowBorder,
                        ]}
                      >
                        <Text style={styles.kvLabel}>{entry.label}</Text>
                        <Text
                          style={[
                            styles.kvValue,
                            entry.isMono && styles.kvMono,
                          ]}
                          numberOfLines={2}
                        >
                          {entry.displayValue}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {isError && errorMessage ? (
                <View style={styles.errorBox}>
                  <AlertCircle size={14} color={colors.destructive} />
                  <Text style={styles.errorText} selectable>
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              {!isError && unwrapped ? (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionLabel}>
                    {t("ai.code.resultLabel")}
                  </Text>
                  {renderStructuredResult()}
                </View>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  wrapper: {
    gap: 6,
    alignSelf: "stretch" as const,
  },
  pill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    alignSelf: "flex-start" as const,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    maxWidth: "100%" as const,
  },
  pillActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  pillError: {
    borderColor: t.colors.destructive,
    backgroundColor: t.colors.destructiveSubtle,
  },
  domainText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textSecondary,
  },
  labelText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  summaryPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
    maxWidth: 160,
  },
  summaryText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  durationText: {
    fontSize: 10,
    fontFamily: t.typography.mono,
    color: t.colors.textMuted,
  },
  body: {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    padding: 10,
    gap: 8,
  },
  topStrip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  toolCaption: {
    fontSize: 11,
    fontFamily: t.typography.mono,
    color: t.colors.textMuted,
    flexShrink: 1,
  },
  rawToggle: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceSubtle,
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
  rawSections: {
    gap: 10,
  },
  formattedSections: {
    gap: 10,
  },
  sectionBlock: {
    gap: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    color: t.colors.textMuted,
  },
  kvGroup: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  kvRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    justifyContent: "space-between" as const,
    gap: 10,
    paddingVertical: 5,
  },
  kvLabel: {
    fontSize: 11,
    color: t.colors.textMuted,
    flexShrink: 0,
  },
  kvValue: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textPrimary,
    textAlign: "right" as const,
    flexShrink: 1,
  },
  kvMono: {
    fontFamily: t.typography.mono,
    fontSize: 11,
  },
  errorBox: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 6,
    padding: 8,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: t.colors.destructiveBorder,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: t.colors.destructive,
  },
  listSection: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  domainRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
    paddingVertical: 6,
  },
  domainRowBorder: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  budgetRow: {
    gap: 5,
    paddingVertical: 6,
  },
  budgetAmounts: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
  },
  mutedMono: {
    fontSize: 12,
    fontFamily: t.typography.mono,
    color: t.colors.textMuted,
  },
  progressTrack: {
    height: 4,
    width: "100%" as const,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceSubtle,
    overflow: "hidden" as const,
  },
  progressFill: {
    height: "100%" as const,
    borderRadius: t.radius.full,
  },
  rowLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  rowCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowBetween: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  rowTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  rowSub: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  eventRow: {
    flexDirection: "row" as const,
    alignItems: "stretch" as const,
    gap: 8,
    paddingVertical: 6,
  },
  eventAccent: {
    width: 3,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primary,
  },
  mailRow: {
    gap: 2,
    paddingVertical: 6,
  },
  kpiGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  kpiCell: {
    flexGrow: 1,
    minWidth: "45%" as const,
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  kpiLabel: {
    fontSize: 10,
    color: t.colors.textMuted,
  },
  overflowNote: {
    fontSize: 11,
    color: t.colors.textMuted,
    paddingTop: 4,
  },
  emptyNote: {
    fontSize: 12,
    color: t.colors.textMuted,
    paddingVertical: 4,
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 18,
    color: t.colors.textSecondary,
  },
})

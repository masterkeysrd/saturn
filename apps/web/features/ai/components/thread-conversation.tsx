import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  deduplicateCopilotEntityRefs,
  describeToolCall,
  extractToolErrorMessage,
  formatCopilotPromptWithContext,
  getStreamPhaseLabel,
  parseCopilotMessageContext,
  splitThinkingFromText,
  type ThreadStreamPhase,
  type ToolDescriptor,
} from "@saturn/core"
import { useCopilot, useThreadStream } from "@saturn/hooks/ai"
import { useI18n, type UseI18nResult } from "@saturn/hooks"
import { useActiveSpaceContext } from "@/features/space/use-space"
import {
  useListAgentsQuery,
  useListModelsQuery,
  type Thread,
  type ThreadMessage,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolState,
} from "@/components/ai-elements/tool"
import { ToolApprovalPreview } from "./tool-approval-preview"
import { ToolChainGroup } from "./tool-chain-group"
import { DomainToolOutput } from "./tool-result-renderer"
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation"
import {
  ModelSelector,
  ModelSelectorButton,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector"
import {
  PromptInput,
  type PromptInputAttachment,
} from "@/components/ai-elements/prompt-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { CopilotEntityBadge } from "./copilot-entity-pill"
import { cn } from "@/lib/utils"
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  FileIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react"

const STARTER_PROMPT_KEYS = [
  "ai.conversation.starter1",
  "ai.conversation.starter2",
  "ai.conversation.starter3",
  "ai.conversation.starter4",
] as const

export interface PendingDrawerPrompt {
  id: string
  text: string
  autoSend?: boolean
}

interface ThreadConversationProps {
  threadId?: string | null
  compact?: boolean
  pendingPrompt?: PendingDrawerPrompt | null
  onPendingPromptConsumed?: () => void
  onThreadCreated?: (thread: Thread) => void
  onThreadUpdated?: (thread: Thread) => void
}

function renderMessageBlocks(msg: ThreadMessage) {
  const blocks = msg.blocks ?? []
  const explicitThinking = blocks
    .filter((b) => b.type === "thinking" && b.text)
    .map((b) => b.text?.trim() ?? "")
    .filter(Boolean)

  const rawTextParts = blocks
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")

  const inlineExtracted = splitThinkingFromText(rawTextParts)
  const thinkingParts = [
    ...explicitThinking,
    ...(inlineExtracted.thinking ? [inlineExtracted.thinking] : []),
  ].join("\n\n")
  const textParts = inlineExtracted.text.trim()

  const attachments = blocks.filter(
    (b) => b.type === "attachment" && b.attachment
  )
  const toolCalls = blocks.filter((b) => b.type === "tool_call")

  const parsedContext =
    msg.role === "user" && textParts
      ? parseCopilotMessageContext(textParts)
      : { refs: [], cleanText: textParts }

  return (
    <>
      {parsedContext.refs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {parsedContext.refs.map((ref) => (
            <CopilotEntityBadge key={ref.key} item={ref} />
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((b, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="gap-1 rounded-full text-xs"
            >
              <FileIcon className="size-3" />
              {b.attachment?.filename}
            </Badge>
          ))}
        </div>
      )}

      {thinkingParts && (
        <Reasoning defaultOpen={false}>
          <ReasoningTrigger preview={thinkingParts} />
          <ReasoningContent>{thinkingParts}</ReasoningContent>
        </Reasoning>
      )}

      {toolCalls.map((tc, i) => (
        <Tool key={tc.toolCallId ?? i} defaultOpen={false}>
          <ToolHeader toolName={tc.toolName ?? "tool"} state="completed" />
          <ToolContent>
            <ToolInput input={tc.arguments} />
          </ToolContent>
        </Tool>
      ))}

      {parsedContext.cleanText && (
        <MessageResponse>{parsedContext.cleanText}</MessageResponse>
      )}
    </>
  )
}

interface NormalizedToolItem {
  key: string
  toolName: string
  state: ToolState
  descriptor: ToolDescriptor
  arguments?: Record<string, unknown>
  result?: Record<string, unknown>
  isError?: boolean
  durationMs?: number
  isStreamingRunning?: boolean
}

function renderSingleToolCard(
  item: NormalizedToolItem,
  spaceId: string | undefined,
  t: UseI18nResult["t"],
  nested = false
) {
  const title =
    item.isStreamingRunning && item.state === "running"
      ? item.descriptor.activeLabel
      : item.state === "completed"
        ? item.descriptor.completedLabel
        : item.descriptor.label

  return (
    <Tool
      key={item.key}
      state={item.state}
      defaultOpen={item.state === "error"}
      className={
        nested ? "mb-0 rounded-none border-0 bg-transparent" : undefined
      }
    >
      <ToolHeader
        toolName={item.toolName}
        title={title}
        domain={item.descriptor.domain}
        domainLabel={item.descriptor.domainLabel}
        serverName={item.descriptor.serverName}
        summary={item.descriptor.summary}
        durationMs={item.durationMs}
        state={item.state}
      />
      <ToolContent toolName={item.toolName}>
        <ToolInput input={item.arguments} />
        {(item.result || item.isError) && (
          <ToolOutput
            output={item.isError ? undefined : item.result}
            rawOutput={item.result}
            errorText={
              item.isError
                ? (extractToolErrorMessage(item.result) ??
                  t("ai.conversation.toolFailed"))
                : undefined
            }
            renderCustomOutput={(unwrapped, fallback) => (
              <DomainToolOutput
                toolName={item.toolName}
                output={unwrapped}
                spaceId={spaceId}
                fallback={fallback}
              />
            )}
          />
        )}
      </ToolContent>
    </Tool>
  )
}

function renderGroupedTools(
  items: NormalizedToolItem[],
  spaceId: string | undefined,
  t: UseI18nResult["t"]
) {
  const nodes: React.ReactNode[] = []
  let readRun: NormalizedToolItem[] = []

  const flushRun = () => {
    if (readRun.length >= 2) {
      const groupKey = `chain-${readRun.map((r) => r.key).join("-")}`
      const groupItems = readRun.map((item) => ({
        key: item.key,
        descriptor: item.descriptor,
        durationMs: item.durationMs,
        renderTool: () => renderSingleToolCard(item, spaceId, t, true),
      }))
      nodes.push(<ToolChainGroup key={groupKey} items={groupItems} />)
    } else if (readRun.length === 1) {
      nodes.push(renderSingleToolCard(readRun[0], spaceId, t, false))
    }
    readRun = []
  }

  for (const item of items) {
    if (item.state === "completed" && item.descriptor.isReadOnly) {
      readRun.push(item)
    } else {
      flushRun()
      nodes.push(renderSingleToolCard(item, spaceId, t, false))
    }
  }
  flushRun()

  return nodes
}

export function ThreadConversation({
  threadId = null,
  compact = false,
  pendingPrompt = null,
  onPendingPromptConsumed,
  onThreadCreated,
  onThreadUpdated,
}: ThreadConversationProps) {
  const location = useLocation()
  const { t } = useI18n()
  const { spaceId } = useActiveSpaceContext()
  const {
    activeView,
    isAmbientDismissed,
    dismissAmbient,
    pinnedItems,
    detachItem,
    clearPinnedItems,
  } = useCopilot()
  const [input, setInput] = useState("")
  const [attachments, setAttachments] = useState<PromptInputAttachment[]>([])
  const threadKey = threadId ?? "__new__"
  const [threadOverrides, setThreadOverrides] = useState<{
    threadKey: string
    agentId?: string
    modelId?: string
  }>({ threadKey })
  const selectedAgentId =
    threadOverrides.threadKey === threadKey
      ? threadOverrides.agentId
      : undefined
  const selectedModelId =
    threadOverrides.threadKey === threadKey
      ? threadOverrides.modelId
      : undefined
  const setSelectedAgentId = useCallback(
    (agentId: string | undefined) => {
      setThreadOverrides((prev) => ({
        threadKey,
        agentId,
        modelId: prev.threadKey === threadKey ? prev.modelId : undefined,
      }))
    },
    [threadKey]
  )
  const setSelectedModelId = useCallback(
    (modelId: string | undefined) => {
      setThreadOverrides((prev) => ({
        threadKey,
        agentId: prev.threadKey === threadKey ? prev.agentId : undefined,
        modelId,
      }))
    },
    [threadKey]
  )
  const [stagedDecisionState, setStagedDecisionState] = useState<{
    approvalsKey: string
    decisions: Record<string, boolean>
  }>({ approvalsKey: "", decisions: {} })
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const consumedPromptIdRef = useRef<string | null>(null)

  const { data: agentsData } = useListAgentsQuery({})
  const { data: modelsData } = useListModelsQuery({ isEnabled: true })

  const agents = useMemo(
    () => (agentsData?.agents ?? []).filter((a) => a.isEnabled),
    [agentsData]
  )
  const models = useMemo(() => modelsData?.models ?? [], [modelsData])

  const {
    thread,
    messages,
    isLoadingMessages,
    isStreaming,
    streamPhase,
    activeToolCall,
    streamingMessage,
    pendingApprovals,
    error,
    sendMessage,
    resolveApprovals,
    stop,
  } = useThreadStream({
    threadId,
    onThreadCreated,
    onThreadUpdated,
  })

  const approvalsKey = `${threadKey}:${pendingApprovals.map((pa) => pa.toolCallId ?? "").join(",")}`
  const stagedDecisions =
    stagedDecisionState.approvalsKey === approvalsKey
      ? stagedDecisionState.decisions
      : {}

  const resolvedPhase: ThreadStreamPhase =
    streamPhase ??
    (isStreaming
      ? streamingMessage?.text
        ? "generating"
        : "thinking"
      : "idle")

  useEffect(() => {
    if (
      !pendingPrompt ||
      !pendingPrompt.autoSend ||
      consumedPromptIdRef.current === pendingPrompt.id
    ) {
      return
    }
    consumedPromptIdRef.current = pendingPrompt.id
    void Promise.resolve(
      sendMessage({
        content: pendingPrompt.text,
        agentId: selectedAgentId ?? thread?.agentId ?? agents[0]?.id,
        modelId: selectedModelId ?? thread?.modelId,
        contextHint: location.pathname,
      })
    ).catch(() => undefined)
    onPendingPromptConsumed?.()
  }, [
    agents,
    location.pathname,
    onPendingPromptConsumed,
    pendingPrompt,
    selectedAgentId,
    selectedModelId,
    sendMessage,
    thread?.agentId,
    thread?.modelId,
  ])

  const effectiveInput =
    input || (!pendingPrompt?.autoSend ? (pendingPrompt?.text ?? "") : "")

  const effectiveAgentId =
    selectedAgentId ?? thread?.agentId ?? agents[0]?.id ?? undefined
  const effectiveModelId = selectedModelId ?? thread?.modelId ?? undefined

  const activeModel = models.find((m) => m.id === effectiveModelId)
  const activeAgent = agents.find((a) => a.id === effectiveAgentId)

  // Pair tool_result blocks from role === 'tool' messages into preceding tool_call rendering
  const visibleMessages = useMemo(() => {
    const resultsByCallId = new Map<
      string,
      { result?: Record<string, unknown>; isError?: boolean }
    >()
    for (const msg of messages) {
      if (msg.role === "tool") {
        for (const b of msg.blocks ?? []) {
          if (b.type === "tool_result" && b.toolCallId) {
            resultsByCallId.set(b.toolCallId, {
              result: b.result,
              isError: b.isError,
            })
          }
        }
      }
    }
    return {
      list: messages.filter((m) => m.role !== "tool"),
      resultsByCallId,
    }
  }, [messages])

  const handleSend = async (overrideText?: string) => {
    if (isStreaming) return
    const content = (overrideText ?? effectiveInput).trim()
    if (!content && attachments.length === 0) return

    const ambientEntity =
      activeView?.activeEntity && !isAmbientDismissed
        ? activeView.activeEntity
        : null
    const contextRefs = deduplicateCopilotEntityRefs([
      ...(ambientEntity ? [ambientEntity] : []),
      ...pinnedItems,
    ])
    const serializedContent = content
      ? formatCopilotPromptWithContext(content, contextRefs)
      : content

    const currentAttachments = attachments
    if (!overrideText) {
      setInput("")
      setAttachments([])
      if (pendingPrompt && !pendingPrompt.autoSend) {
        onPendingPromptConsumed?.()
      }
    }
    if (pinnedItems.length > 0) {
      clearPinnedItems()
    }

    try {
      await sendMessage({
        content: serializedContent,
        agentId: effectiveAgentId,
        modelId: effectiveModelId,
        contextHint: activeView?.viewId || location.pathname,
        attachments: overrideText
          ? []
          : currentAttachments.map((a) => ({
              filename: a.filename,
              contentType: a.contentType,
              file: a.file,
            })),
      })
    } catch {
      // Errors are surfaced via useThreadStream's error state.
    }
  }

  const handleAddAttachments = (files: File[]) => {
    const next = files.slice(0, 5 - attachments.length).map((file, idx) => ({
      id: `${file.name}-${Date.now()}-${idx}`,
      file,
      filename: file.name,
      contentType: file.type || "text/plain",
    }))
    setAttachments((prev) => [...prev, ...next].slice(0, 5))
  }

  const handleApproveAll = (approved: boolean) => {
    if (pendingApprovals.length === 0) return
    void resolveApprovals(
      pendingApprovals.map((pa) => ({
        toolCallId: pa.toolCallId ?? "",
        approved,
      }))
    )
  }

  const handleSingleDecision = (toolCallId: string, approved: boolean) => {
    if (pendingApprovals.length <= 1) {
      void resolveApprovals([{ toolCallId, approved }])
      return
    }
    setStagedDecisionState((prev) => ({
      approvalsKey,
      decisions: {
        ...(prev.approvalsKey === approvalsKey ? prev.decisions : {}),
        [toolCallId]: approved,
      },
    }))
  }

  const allStaged =
    pendingApprovals.length > 0 &&
    pendingApprovals.every(
      (pa) => pa.toolCallId && stagedDecisions[pa.toolCallId] !== undefined
    )

  const handleSubmitStagedDecisions = () => {
    if (!allStaged) return
    void resolveApprovals(
      pendingApprovals.map((pa) => ({
        toolCallId: pa.toolCallId ?? "",
        approved: Boolean(stagedDecisions[pa.toolCallId ?? ""]),
      }))
    )
  }

  const groupedModels = useMemo(() => {
    const groups = new Map<string, typeof models>()
    for (const m of models) {
      const key =
        m.providerName || m.providerDriver || t("ai.conversation.modelsGroup")
      const list = groups.get(key) ?? []
      list.push(m)
      groups.set(key, list)
    }
    return Array.from(groups.entries())
  }, [models, t])

  const starterPrompts =
    activeView?.suggestions && activeView.suggestions.length > 0
      ? activeView.suggestions
      : STARTER_PROMPT_KEYS.map((key) => t(key))

  const visibleAmbientEntity =
    activeView?.activeEntity &&
    !isAmbientDismissed &&
    !pinnedItems.some((p) => p.key === activeView.activeEntity?.key)
      ? activeView.activeEntity
      : null

  const hasContextChips =
    Boolean(visibleAmbientEntity) || pinnedItems.length > 0

  const agentSelectControl =
    agents.length > 0 ? (
      <Select
        value={effectiveAgentId ?? ""}
        onValueChange={(val) => setSelectedAgentId(val || undefined)}
      >
        <SelectTrigger
          className={cn(
            "w-auto max-w-[170px] border-border px-2.5 text-xs",
            compact ? "h-7 rounded-lg bg-control" : "h-8 rounded-lg bg-control"
          )}
        >
          <BotIcon className="mr-1 size-3.5 text-muted-foreground" />
          <SelectValue>
            {activeAgent?.name ?? t("ai.conversation.saturnAssistant")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {agents.map((a) => (
            <SelectItem key={a.id} value={a.id ?? ""} className="text-xs">
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {compact && (agentSelectControl || activeView) && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-card/40 px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {agentSelectControl}
          </div>
          {activeView && (
            <Badge
              variant="secondary"
              className="max-w-[170px] truncate rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {t("ai.conversation.context", { title: activeView.title })}
            </Badge>
          )}
        </div>
      )}

      <Conversation className="min-h-0 flex-1">
        <ConversationContent
          className={cn(
            compact ? "px-3 py-3" : "mx-auto w-full max-w-3xl px-4 py-6"
          )}
        >
          {visibleMessages.list.length === 0 &&
          !streamingMessage &&
          !isStreaming &&
          !isLoadingMessages &&
          pendingApprovals.length === 0 ? (
            <ConversationEmptyState
              icon={<SparklesIcon className="size-8 text-primary/70" />}
              title={activeAgent?.name || t("ai.conversation.saturnAssistant")}
              description={t("ai.conversation.emptyDesc")}
              className={compact ? "py-6" : "py-10"}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <SparklesIcon className="size-5" />
                </div>
                <div className="space-y-1 text-center">
                  <h3 className="text-sm font-semibold">
                    {activeAgent?.name || t("ai.conversation.saturnAssistant")}
                  </h3>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    {t("ai.conversation.emptyTagline")}
                  </p>
                  {activeView && (
                    <div className="pt-1">
                      <Badge
                        variant="outline"
                        className="rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {t("ai.conversation.context", {
                          title: activeView.title,
                        })}
                      </Badge>
                    </div>
                  )}
                </div>
                {compact ? (
                  <div className="flex w-full flex-col gap-1.5 pt-1">
                    {starterPrompts.map((prompt) => (
                      <Suggestion
                        key={prompt}
                        suggestion={prompt}
                        onClick={(p) => void handleSend(p)}
                        className="h-auto w-full justify-start rounded-lg px-3 py-2 text-left text-xs leading-snug whitespace-normal"
                      />
                    ))}
                  </div>
                ) : (
                  <Suggestions className="max-w-xl">
                    {starterPrompts.map((prompt) => (
                      <Suggestion
                        key={prompt}
                        suggestion={prompt}
                        onClick={(p) => void handleSend(p)}
                      />
                    ))}
                  </Suggestions>
                )}
              </div>
            </ConversationEmptyState>
          ) : (
            <>
              {visibleMessages.list.map((msg, idx) => {
                const role =
                  msg.role === "user" ? "user" : ("assistant" as const)
                const toolCallBlocks = (msg.blocks ?? []).filter(
                  (b) => b.type === "tool_call"
                )
                const nonToolBlocks = (msg.blocks ?? []).filter(
                  (b) => b.type !== "tool_call"
                )
                return (
                  <Message key={msg.id ?? idx} from={role}>
                    <MessageContent>
                      {renderMessageBlocks({ ...msg, blocks: nonToolBlocks })}
                      {renderGroupedTools(
                        toolCallBlocks.map((tc, tcIdx) => {
                          const res = tc.toolCallId
                            ? visibleMessages.resultsByCallId.get(tc.toolCallId)
                            : undefined
                          const isAwaitingApproval = Boolean(
                            tc.toolCallId &&
                            pendingApprovals.some(
                              (p) => p.toolCallId === tc.toolCallId
                            )
                          )
                          const state: ToolState = res
                            ? res.isError
                              ? "error"
                              : "completed"
                            : isAwaitingApproval
                              ? "awaiting_approval"
                              : "rejected"
                          const rawName = tc.toolName ?? "tool"
                          const descriptor = describeToolCall({
                            toolName: rawName,
                            arguments: tc.arguments,
                            result: res?.result,
                          })
                          return {
                            key: tc.toolCallId ?? String(tcIdx),
                            toolName: rawName,
                            state,
                            descriptor,
                            arguments: tc.arguments,
                            result: res?.result,
                            isError: res?.isError,
                          }
                        }),
                        spaceId,
                        t
                      )}
                    </MessageContent>
                  </Message>
                )
              })}

              {(streamingMessage || isStreaming) &&
                (() => {
                  const streamExtracted = splitThinkingFromText(
                    streamingMessage?.text ?? ""
                  )
                  const mergedStreamThinking = [
                    streamingMessage?.thinking?.trim() ?? "",
                    streamExtracted.thinking,
                  ]
                    .filter(Boolean)
                    .join("\n\n")
                  const cleanStreamText = streamExtracted.text
                  const isActivelyThinking =
                    isStreaming &&
                    (resolvedPhase === "thinking" ||
                      streamExtracted.hasUnclosedThink)

                  return (
                    <Message from="assistant">
                      <MessageContent>
                        {mergedStreamThinking && (
                          <Reasoning isStreaming={isActivelyThinking}>
                            <ReasoningTrigger preview={mergedStreamThinking} />
                            <ReasoningContent>
                              {mergedStreamThinking}
                            </ReasoningContent>
                          </Reasoning>
                        )}

                        {streamingMessage?.toolCalls &&
                          renderGroupedTools(
                            streamingMessage.toolCalls.map((tc) => ({
                              key: tc.toolCallId,
                              toolName: tc.toolName,
                              state: tc.status,
                              descriptor: describeToolCall({
                                toolName: tc.toolName,
                                arguments: tc.arguments,
                                result: tc.result,
                              }),
                              arguments: tc.arguments,
                              result: tc.result,
                              isError: tc.isError,
                              durationMs: tc.durationMs,
                              isStreamingRunning: true,
                            })),
                            spaceId,
                            t
                          )}

                        {cleanStreamText.trim() && (
                          <MessageResponse isAnimating={isStreaming}>
                            {cleanStreamText}
                          </MessageResponse>
                        )}

                        {isStreaming && (
                          <div
                            className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground"
                            role="status"
                            aria-live="polite"
                          >
                            <Loader2Icon className="size-3.5 animate-spin text-primary" />
                            <span>
                              {getStreamPhaseLabel(resolvedPhase, {
                                activeToolName: activeToolCall?.toolName,
                                hasCompletedTools:
                                  (streamingMessage?.toolCalls.length ?? 0) > 0,
                              }) || t("ai.conversation.thinking")}
                            </span>
                          </div>
                        )}
                      </MessageContent>
                    </Message>
                  )
                })()}

              {pendingApprovals.length > 0 && (
                <div className="space-y-2">
                  {pendingApprovals.map((pa) => {
                    const desc = describeToolCall({
                      toolName: pa.toolName ?? "tool",
                      mcpServerName: pa.mcpServerName,
                      arguments: pa.arguments,
                    })
                    const isDestructive =
                      desc.isDestructive || Boolean(pa.destructiveHint)
                    return (
                      <Confirmation
                        key={pa.toolCallId}
                        state="approval-requested"
                        destructive={isDestructive}
                      >
                        <ConfirmationTitle destructive={isDestructive}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>
                              {t("ai.conversation.confirm", {
                                label: desc.label,
                              })}
                            </span>
                            <Badge
                              variant="outline"
                              className="rounded-full px-1.5 py-0 text-[10px]"
                            >
                              {desc.domainLabel}
                            </Badge>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                              {pa.toolName}
                            </code>
                            {pa.mcpServerName && (
                              <span className="text-muted-foreground">
                                {t("ai.conversation.via", {
                                  server: pa.mcpServerName,
                                })}
                              </span>
                            )}
                          </div>
                          <ToolApprovalPreview
                            toolName={pa.toolName ?? "tool"}
                            arguments={pa.arguments}
                            destructive={isDestructive}
                          />
                        </ConfirmationTitle>
                        <ConfirmationRequest>
                          <ConfirmationActions>
                            <ConfirmationAction
                              variant={
                                pendingApprovals.length > 1 &&
                                stagedDecisions[pa.toolCallId ?? ""] === false
                                  ? "destructive"
                                  : "outline"
                              }
                              aria-pressed={
                                pendingApprovals.length > 1
                                  ? stagedDecisions[pa.toolCallId ?? ""] ===
                                    false
                                  : undefined
                              }
                              onClick={() =>
                                handleSingleDecision(pa.toolCallId ?? "", false)
                              }
                            >
                              {pendingApprovals.length > 1 &&
                              stagedDecisions[pa.toolCallId ?? ""] === false
                                ? t("ai.conversation.rejected")
                                : t("ai.conversation.reject")}
                            </ConfirmationAction>
                            <ConfirmationAction
                              variant={
                                pendingApprovals.length > 1 &&
                                stagedDecisions[pa.toolCallId ?? ""] ===
                                  undefined
                                  ? "outline"
                                  : "default"
                              }
                              aria-pressed={
                                pendingApprovals.length > 1
                                  ? stagedDecisions[pa.toolCallId ?? ""] ===
                                    true
                                  : undefined
                              }
                              onClick={() =>
                                handleSingleDecision(pa.toolCallId ?? "", true)
                              }
                            >
                              {pendingApprovals.length > 1 &&
                              stagedDecisions[pa.toolCallId ?? ""] === true
                                ? t("ai.conversation.approved")
                                : t("ai.conversation.approve")}
                            </ConfirmationAction>
                          </ConfirmationActions>
                        </ConfirmationRequest>
                      </Confirmation>
                    )
                  })}

                  {pendingApprovals.length > 1 && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <ConfirmationAction
                        variant="outline"
                        onClick={() => handleApproveAll(false)}
                      >
                        {t("ai.conversation.rejectAll")}
                      </ConfirmationAction>
                      <ConfirmationAction
                        variant="outline"
                        onClick={() => handleApproveAll(true)}
                      >
                        {t("ai.conversation.approveAll", {
                          n: pendingApprovals.length,
                        })}
                      </ConfirmationAction>
                      <ConfirmationAction
                        disabled={!allStaged}
                        onClick={handleSubmitStagedDecisions}
                      >
                        {t("ai.conversation.submitDecisions", {
                          approved: pendingApprovals.filter(
                            (pa) =>
                              pa.toolCallId &&
                              stagedDecisions[pa.toolCallId] !== undefined
                          ).length,
                          total: pendingApprovals.length,
                        })}
                      </ConfirmationAction>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
              {error.message || t("ai.conversation.turnFailed")}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div
        className={cn(
          "shrink-0 border-t border-border/40 bg-background/95",
          compact ? "p-3" : "mx-auto w-full max-w-3xl border-t-0 px-4 pb-4"
        )}
      >
        <PromptInput
          value={effectiveInput}
          onValueChange={(val) => {
            if (pendingPrompt && !pendingPrompt.autoSend) {
              onPendingPromptConsumed?.()
            }
            setInput(val)
          }}
          onSubmitMessage={() => void handleSend()}
          isStreaming={isStreaming}
          onStop={() => void stop()}
          attachments={attachments}
          onAddAttachments={handleAddAttachments}
          onRemoveAttachment={(id) =>
            setAttachments((prev) => prev.filter((a) => a.id !== id))
          }
          contextChips={
            hasContextChips ? (
              <>
                {visibleAmbientEntity && (
                  <CopilotEntityBadge
                    item={visibleAmbientEntity}
                    ambient
                    onDismiss={dismissAmbient}
                  />
                )}
                {pinnedItems.map((item) => (
                  <CopilotEntityBadge
                    key={item.key}
                    item={item}
                    onDismiss={() => detachItem(item.key)}
                  />
                ))}
              </>
            ) : undefined
          }
          toolbarLeft={
            <>
              {!compact && agentSelectControl}

              <ModelSelector
                open={modelPickerOpen}
                onOpenChange={setModelPickerOpen}
              >
                <ModelSelectorTrigger
                  render={
                    <ModelSelectorButton
                      aria-label={t("ai.conversation.selectModel")}
                    >
                      <ModelSelectorLogo driver={activeModel?.providerDriver} />
                      <span className="max-w-[140px] truncate">
                        {activeModel?.displayName ??
                          t("ai.conversation.workspaceDefault")}
                      </span>
                      <ChevronDownIcon className="size-3 text-muted-foreground" />
                    </ModelSelectorButton>
                  }
                />
                <ModelSelectorContent side="top" align="start" sideOffset={8}>
                  <ModelSelectorInput
                    placeholder={t("ai.conversation.searchModels")}
                  />
                  <ModelSelectorList>
                    <ModelSelectorEmpty>
                      {t("ai.conversation.noModels")}
                    </ModelSelectorEmpty>
                    <ModelSelectorGroup
                      heading={t("ai.conversation.workspaceDefault")}
                    >
                      <ModelSelectorItem
                        value="workspace-default"
                        onSelect={() => {
                          setSelectedModelId(undefined)
                          setModelPickerOpen(false)
                        }}
                      >
                        <SparklesIcon className="size-3.5 text-primary" />
                        <ModelSelectorName>
                          {t("ai.conversation.workspaceDefault")}
                        </ModelSelectorName>
                        {!effectiveModelId && (
                          <CheckIcon className="size-3.5 text-primary" />
                        )}
                      </ModelSelectorItem>
                    </ModelSelectorGroup>
                    {groupedModels.map(([groupName, groupItems]) => (
                      <ModelSelectorGroup key={groupName} heading={groupName}>
                        {groupItems.map((m) => (
                          <ModelSelectorItem
                            key={m.id}
                            value={`${m.displayName} ${m.modelId} ${m.providerDriver}`}
                            onSelect={() => {
                              setSelectedModelId(m.id)
                              setModelPickerOpen(false)
                            }}
                          >
                            <ModelSelectorLogo driver={m.providerDriver} />
                            <ModelSelectorName>
                              {m.displayName}
                            </ModelSelectorName>
                            {effectiveModelId === m.id && (
                              <CheckIcon className="size-3.5 text-primary" />
                            )}
                          </ModelSelectorItem>
                        ))}
                      </ModelSelectorGroup>
                    ))}
                  </ModelSelectorList>
                </ModelSelectorContent>
              </ModelSelector>
            </>
          }
        />
      </div>
    </div>
  )
}

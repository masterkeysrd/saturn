import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  describeToolCall,
  getStreamPhaseLabel,
  type ThreadStreamPhase,
} from "@saturn/core"
import { useThreadStream } from "@saturn/hooks/ai"
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
} from "@/components/ai-elements/tool"
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
import { cn } from "@/lib/utils"
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  FileIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react"

const STARTER_PROMPTS = [
  "Summarize my spending this month vs budget",
  "What events are on my calendar this week?",
  "Check my unread emails for action items",
  "List active workflows and recent runs",
]

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
  const thinkingParts = blocks
    .filter((b) => b.type === "thinking" && b.text)
    .map((b) => b.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")

  const textParts = blocks
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")

  const attachments = blocks.filter(
    (b) => b.type === "attachment" && b.attachment
  )
  const toolCalls = blocks.filter((b) => b.type === "tool_call")

  return (
    <>
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
          <ReasoningTrigger />
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

      {textParts && <MessageResponse>{textParts}</MessageResponse>}
    </>
  )
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
  const [input, setInput] = useState("")
  const [attachments, setAttachments] = useState<PromptInputAttachment[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(
    undefined
  )
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(
    undefined
  )
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

    const currentAttachments = attachments
    if (!overrideText) {
      setInput("")
      setAttachments([])
      if (pendingPrompt && !pendingPrompt.autoSend) {
        onPendingPromptConsumed?.()
      }
    }

    try {
      await sendMessage({
        content,
        agentId: effectiveAgentId,
        modelId: effectiveModelId,
        contextHint: location.pathname,
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
    void resolveApprovals([{ toolCallId, approved }])
  }

  const groupedModels = useMemo(() => {
    const groups = new Map<string, typeof models>()
    for (const m of models) {
      const key = m.providerName || m.providerDriver || "Models"
      const list = groups.get(key) ?? []
      list.push(m)
      groups.set(key, list)
    }
    return Array.from(groups.entries())
  }, [models])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent
          className={cn(
            compact ? "px-3 py-3" : "mx-auto w-full max-w-3xl px-4 py-6"
          )}
        >
          {visibleMessages.list.length === 0 &&
          !streamingMessage &&
          !isStreaming &&
          !isLoadingMessages ? (
            <ConversationEmptyState
              icon={<SparklesIcon className="size-8 text-primary/70" />}
              title={activeAgent?.name || "Saturn Assistant"}
              description="Ask about your finances, calendar, mail, or workflows — Saturn uses your workspace tools safely with confirmation before changes."
              className="py-10"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <SparklesIcon className="size-5" />
                </div>
                <div className="space-y-1 text-center">
                  <h3 className="text-sm font-semibold">
                    {activeAgent?.name || "Saturn Assistant"}
                  </h3>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Ask across Finance, Calendar, Mail, and Workflows. Mutating
                    actions pause for your confirmation.
                  </p>
                </div>
                {!compact && (
                  <Suggestions className="max-w-xl">
                    {STARTER_PROMPTS.map((prompt) => (
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
                      {toolCallBlocks.map((tc, tcIdx) => {
                        const res = tc.toolCallId
                          ? visibleMessages.resultsByCallId.get(tc.toolCallId)
                          : undefined
                        const state = res
                          ? res.isError
                            ? "error"
                            : "completed"
                          : "awaiting_approval"
                        const rawName = tc.toolName ?? "tool"
                        const desc = describeToolCall({
                          toolName: rawName,
                          arguments: tc.arguments,
                          result: res?.result,
                        })
                        return (
                          <Tool
                            key={tc.toolCallId ?? tcIdx}
                            state={state}
                            defaultOpen={Boolean(res?.isError)}
                          >
                            <ToolHeader
                              toolName={rawName}
                              title={
                                state === "completed"
                                  ? desc.completedLabel
                                  : desc.label
                              }
                              domain={desc.domain}
                              domainLabel={desc.domainLabel}
                              serverName={desc.serverName}
                              summary={desc.summary}
                              state={state}
                            />
                            <ToolContent toolName={rawName}>
                              <ToolInput input={tc.arguments} />
                              {res && (
                                <ToolOutput
                                  output={res.isError ? undefined : res.result}
                                  errorText={
                                    res.isError
                                      ? JSON.stringify(res.result ?? {})
                                      : undefined
                                  }
                                />
                              )}
                            </ToolContent>
                          </Tool>
                        )
                      })}
                    </MessageContent>
                  </Message>
                )
              })}

              {(streamingMessage || isStreaming) && (
                <Message from="assistant">
                  <MessageContent>
                    {streamingMessage?.thinking?.trim() && (
                      <Reasoning
                        isStreaming={
                          isStreaming && resolvedPhase === "thinking"
                        }
                      >
                        <ReasoningTrigger />
                        <ReasoningContent>
                          {streamingMessage.thinking.trim()}
                        </ReasoningContent>
                      </Reasoning>
                    )}

                    {streamingMessage?.toolCalls.map((tc) => {
                      const desc = describeToolCall({
                        toolName: tc.toolName,
                        arguments: tc.arguments,
                        result: tc.result,
                      })
                      return (
                        <Tool
                          key={tc.toolCallId}
                          state={tc.status}
                          defaultOpen={tc.status === "error"}
                        >
                          <ToolHeader
                            toolName={tc.toolName}
                            title={
                              tc.status === "running"
                                ? desc.activeLabel
                                : tc.status === "completed"
                                  ? desc.completedLabel
                                  : desc.label
                            }
                            domain={desc.domain}
                            domainLabel={desc.domainLabel}
                            serverName={desc.serverName}
                            summary={desc.summary}
                            durationMs={tc.durationMs}
                            state={tc.status}
                          />
                          <ToolContent toolName={tc.toolName}>
                            <ToolInput input={tc.arguments} />
                            {(tc.result || tc.isError) && (
                              <ToolOutput
                                output={tc.isError ? undefined : tc.result}
                                errorText={
                                  tc.isError
                                    ? JSON.stringify(tc.result ?? {})
                                    : undefined
                                }
                              />
                            )}
                          </ToolContent>
                        </Tool>
                      )
                    })}

                    {streamingMessage?.text?.trim() && (
                      <MessageResponse isAnimating={isStreaming}>
                        {streamingMessage.text.trimStart()}
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
                          }) || "Thinking…"}
                        </span>
                      </div>
                    )}
                  </MessageContent>
                </Message>
              )}

              {pendingApprovals.length > 0 && (
                <div className="space-y-2">
                  {pendingApprovals.map((pa) => {
                    const desc = describeToolCall({
                      toolName: pa.toolName ?? "tool",
                      mcpServerName: pa.mcpServerName,
                      arguments: pa.arguments,
                    })
                    return (
                      <Confirmation
                        key={pa.toolCallId}
                        state="approval-requested"
                      >
                        <ConfirmationTitle>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>Confirm {desc.label}</span>
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
                                via {pa.mcpServerName}
                              </span>
                            )}
                          </div>
                          {pa.arguments &&
                            Object.keys(pa.arguments).length > 0 && (
                              <pre className="mt-2 overflow-x-auto rounded-lg bg-background/80 p-2 font-mono text-[11px] text-muted-foreground">
                                {JSON.stringify(pa.arguments, null, 2)}
                              </pre>
                            )}
                        </ConfirmationTitle>
                        <ConfirmationRequest>
                          <ConfirmationActions>
                            <ConfirmationAction
                              variant="outline"
                              onClick={() =>
                                handleSingleDecision(pa.toolCallId ?? "", false)
                              }
                            >
                              Reject
                            </ConfirmationAction>
                            <ConfirmationAction
                              onClick={() =>
                                handleSingleDecision(pa.toolCallId ?? "", true)
                              }
                            >
                              Approve
                            </ConfirmationAction>
                          </ConfirmationActions>
                        </ConfirmationRequest>
                      </Confirmation>
                    )
                  })}

                  {pendingApprovals.length > 1 && (
                    <div className="flex justify-end gap-2">
                      <ConfirmationAction
                        variant="outline"
                        onClick={() => handleApproveAll(false)}
                      >
                        Reject All
                      </ConfirmationAction>
                      <ConfirmationAction
                        onClick={() => handleApproveAll(true)}
                      >
                        Approve All ({pendingApprovals.length})
                      </ConfirmationAction>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
              {error.message || "Failed to execute AI turn"}
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
          toolbarLeft={
            <>
              {agents.length > 0 && (
                <Select
                  value={effectiveAgentId ?? ""}
                  onValueChange={(val) => setSelectedAgentId(val || undefined)}
                >
                  <SelectTrigger className="h-8 w-auto max-w-[170px] rounded-full border-border/60 px-2.5 text-xs">
                    <BotIcon className="mr-1 size-3.5 text-muted-foreground" />
                    <SelectValue>
                      {activeAgent?.name ?? "Saturn Assistant"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem
                        key={a.id}
                        value={a.id ?? ""}
                        className="text-xs"
                      >
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <ModelSelector
                open={modelPickerOpen}
                onOpenChange={setModelPickerOpen}
              >
                <ModelSelectorTrigger
                  render={
                    <ModelSelectorButton aria-label="Select model">
                      <ModelSelectorLogo driver={activeModel?.providerDriver} />
                      <span className="max-w-[140px] truncate">
                        {activeModel?.displayName ?? "Workspace Default"}
                      </span>
                      <ChevronDownIcon className="size-3 text-muted-foreground" />
                    </ModelSelectorButton>
                  }
                />
                <ModelSelectorContent side="top" align="start" sideOffset={8}>
                  <ModelSelectorInput placeholder="Search workspace models..." />
                  <ModelSelectorList>
                    <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                    <ModelSelectorGroup heading="Workspace Default">
                      <ModelSelectorItem
                        value="workspace-default"
                        onSelect={() => {
                          setSelectedModelId(undefined)
                          setModelPickerOpen(false)
                        }}
                      >
                        <SparklesIcon className="size-3.5 text-primary" />
                        <ModelSelectorName>Workspace Default</ModelSelectorName>
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

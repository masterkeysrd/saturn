import type { Flow } from "@saturn/api/saturn/platform/workflow/v1/workflow"

let pendingDraftFlow: Flow | null = null

export function setPendingWorkflowDraft(flow: Flow | null): void {
  pendingDraftFlow = flow
}

export function consumePendingWorkflowDraft(): Flow | null {
  const next = pendingDraftFlow
  pendingDraftFlow = null
  return next
}

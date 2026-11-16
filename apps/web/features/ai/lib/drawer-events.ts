export interface OpenAIDrawerDetail {
  prompt?: string
  threadId?: string | null
  autoSend?: boolean
}

export const OPEN_AI_DRAWER_EVENT = "saturn:open-ai-drawer"

export function openAIDrawer(detail: OpenAIDrawerDetail = {}): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<OpenAIDrawerDetail>(OPEN_AI_DRAWER_EVENT, { detail })
  )
}

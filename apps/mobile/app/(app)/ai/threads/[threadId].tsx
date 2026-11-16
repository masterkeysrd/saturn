import { useLocalSearchParams } from "expo-router"
import { MobileChatScreen } from "@/components/ai/chat-screen"

export default function AIChatThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>()
  return <MobileChatScreen threadId={threadId ?? null} />
}

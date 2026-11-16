import { useLocalSearchParams } from "expo-router"
import { MobileChatScreen } from "@/components/ai/chat-screen"

export default function AIChatIndexScreen() {
  const { prompt } = useLocalSearchParams<{ prompt?: string }>()
  return <MobileChatScreen threadId={null} initialPrompt={prompt} />
}

import { useState, type FormEvent } from "react"
import { SendHorizontal, Sparkles } from "lucide-react"
import { useI18n } from "@saturn/hooks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { openAIDrawer } from "@/features/ai/lib/drawer-events"

const QUICK_PROMPTS_EN = [
  "Summarize my spending this month",
  "What is on my schedule today?",
  "Check unread emails for action items",
]

const QUICK_PROMPTS_ES = [
  "Resume mis gastos de este mes",
  "¿Qué tengo en mi agenda hoy?",
  "Revisa mis correos sin leer",
]

export function AiQuickAskWidget() {
  const [prompt, setPrompt] = useState("")
  const { language } = useI18n()
  const quickPrompts = language === "es" ? QUICK_PROMPTS_ES : QUICK_PROMPTS_EN

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed) {
      openAIDrawer()
      return
    }
    setPrompt("")
    openAIDrawer({ prompt: trimmed, autoSend: true })
  }

  return (
    <section
      aria-label={language === "es" ? "Consulta rápida IA" : "AI Quick Ask"}
      className="flex flex-col gap-2"
    >
      <form
        onSubmit={handleSubmit}
        className="flex h-11 items-center gap-2 rounded-xl border border-border bg-control px-2.5 shadow-2xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40"
      >
        <Sparkles className="size-4 shrink-0 text-primary" />
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            language === "es"
              ? "Pregunta a Saturn IA sobre finanzas, calendario o correo..."
              : "Ask Saturn AI anything across Finance, Calendar & Mail..."
          }
          aria-label={
            language === "es" ? "Preguntar a Saturn IA" : "Ask Saturn AI"
          }
          className="h-9 rounded-none border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon-sm"
          aria-label={language === "es" ? "Preguntar a IA" : "Ask AI"}
          className="size-8 shrink-0 cursor-pointer rounded-lg"
        >
          <SendHorizontal className="size-4" />
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        {quickPrompts.map((q) => (
          <Button
            key={q}
            type="button"
            variant="outline"
            size="xs"
            onClick={() => openAIDrawer({ prompt: q, autoSend: true })}
            className="h-7 cursor-pointer rounded-full border-border/70 px-3 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            {q}
          </Button>
        ))}
      </div>
    </section>
  )
}

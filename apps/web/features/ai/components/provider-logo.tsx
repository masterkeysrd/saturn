import type { SVGProps } from "react"
import { Cpu } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProviderLogoProps extends SVGProps<SVGSVGElement> {
  driver?: string
  className?: string
}

export function ProviderLogo({
  driver,
  className,
  ...props
}: ProviderLogoProps) {
  const normalized = (driver ?? "").toLowerCase().trim()
  const cls = cn("size-4 shrink-0", className)

  switch (normalized) {
    case "gemini":
    case "google":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-label="Google Gemini"
          className={cls}
          {...props}
        >
          <path
            d="M12 2C12.3 7.3 16.7 11.7 22 12C16.7 12.3 12.3 16.7 12 22C11.7 16.7 7.3 12.3 2 12C7.3 11.7 11.7 7.3 12 2Z"
            fill="currentColor"
          />
        </svg>
      )

    case "openai":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-label="OpenAI"
          className={cls}
          {...props}
        >
          <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07ZM13.26 22.43a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.8.8 0 0 0 .4-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.5 4.5ZM3.6 18.3a4.47 4.47 0 0 1-.54-3.01l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.95a4.5 4.5 0 0 1-6.14-1.65ZM2.34 7.9A4.49 4.49 0 0 1 4.7 5.92V11.6a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0L3.99 14.03A4.5 4.5 0 0 1 2.34 7.9Zm16.6 3.86-5.84-3.39 2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.67a.79.79 0 0 0-.4-.67Zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66ZM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.7 5.46a.8.8 0 0 0-.39.68v6.72Zm1.1-2.36 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5v-3Z" />
        </svg>
      )

    case "anthropic":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-label="Anthropic"
          className={cls}
          {...props}
        >
          <path d="M13.83 3.5h-2.78L5.2 20.5h2.66l1.2-3.6h5.88l1.2 3.6h2.66L13.83 3.5Zm-4.01 11.1L12 8.05l2.18 6.55H9.82Zm7.55-11.1h-2.46l4.94 17h2.46l-4.94-17Z" />
        </svg>
      )

    case "openrouter":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-label="OpenRouter"
          className={cls}
          {...props}
        >
          <circle cx="5" cy="12" r="2.2" />
          <circle cx="19" cy="6" r="2.2" />
          <circle cx="19" cy="18" r="2.2" />
          <path d="M7.2 11.2 16.8 6.8" />
          <path d="M7.2 12.8 16.8 17.2" />
          <path d="M7.2 12h6.8" />
          <circle cx="16" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      )

    case "ollama":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-label="Ollama"
          className={cls}
          {...props}
        >
          <path d="M7 10V5.5C7 4.1 8 3 9 3s2 1.2 2 3v1h2V6c0-1.8 1-3 2-3s2 1.1 2 2.5V10a5.5 5.5 0 0 1 1 3.2V16a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-2.8A5.5 5.5 0 0 1 7 10Z" />
          <circle
            cx="9.75"
            cy="13"
            r="0.85"
            fill="currentColor"
            stroke="none"
          />
          <circle
            cx="14.25"
            cy="13"
            r="0.85"
            fill="currentColor"
            stroke="none"
          />
          <path d="M10.5 16.2c.9.7 2.1.7 3 0" />
        </svg>
      )

    default:
      return <Cpu className={cls} aria-label="OpenAI-Compatible" />
  }
}

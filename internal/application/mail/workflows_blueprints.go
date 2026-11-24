package mail

import (
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

// SystemFlowMailSummarizeThread is the built-in system flow key for email thread summarization.
const SystemFlowMailSummarizeThread = "system.mail.summarize_thread"

func registerMailSystemFlows(reg *workflow.Registry) {
	reg.RegisterSystemFlow(workflow.SystemFlowBlueprint{
		SystemKey: SystemFlowMailSummarizeThread,
		Build:     buildSummarizeThreadFlow,
	})
}

// SummarizeThreadFlowInput is the strongly-typed input of the built-in
// system.mail.summarize_thread flow.
type SummarizeThreadFlowInput struct {
	ThreadID string `json:"thread_id"`
	Language string `json:"language,omitempty"`
}

// SummarizeThreadFlowKey is the typed descriptor for the built-in thread
// summarization system flow.
var SummarizeThreadFlowKey = workflow.NewSystemFlowKey[SummarizeThreadFlowInput](SystemFlowMailSummarizeThread)

type threadSummaryExtraction struct {
	TLDR        string   `json:"tldr"`
	KeyPoints   []string `json:"key_points"`
	ActionItems []string `json:"action_items"`
}

type saveThreadSummaryTemplate struct {
	ThreadID      string `json:"thread_id"`
	Language      string `json:"language"`
	TLDR          string `json:"tldr"`
	KeyPoints     string `json:"key_points"`
	ActionItems   string `json:"action_items"`
	LastMessageID string `json:"last_message_id"`
	LastMessageAt string `json:"last_message_at"`
	MessageCount  string `json:"message_count"`
}

type summarizeThreadOutputTemplate struct {
	ThreadID string `json:"thread_id"`
	Language string `json:"language"`
	Summary  string `json:"summary"`
}

type autoSummarizeTriggerMapping struct {
	ThreadID string `json:"thread_id"`
}

func buildSummarizeThreadFlow(spaceID string) (*workflow.Flow, []workflow.Trigger) {
	steps := []workflow.StepNode{
		workflow.LLMStep(workflow.LLMStepConfig{
			ID:   "summarize_thread",
			Name: "Summarize Email Thread",
			Sources: map[string]workflow.SourceBinding{
				"thread": workflow.Source(workflow.SourceConfig[GetThreadParams]{
					Loader:   "mail.thread",
					Params:   GetThreadParams{ID: "{{ input.thread_id }}"},
					Required: true,
				}),
			},
			System: `You are Saturn's email thread summarizer. Analyze the chronological email conversation and produce a concise summary in {{ input.?language.orValue('en') }}.

RULES:
1. tldr: A single tight paragraph (max 3 sentences) capturing the purpose and current state of the conversation.
2. key_points: 2-5 short, distinct, factual bullet points with the essential decisions, facts, or context. No filler.
3. action_items: 0-5 concrete follow-ups someone must do (who does what). Leave empty when the thread requests nothing.
4. NEVER invent facts, names, dates, or commitments not present in the messages.
5. Answer strictly in the requested language.`,
			Prompt:       "Email thread:\n{{ toJSON(sources.thread) }}",
			OutputSchema: workflow.SchemaFor[threadSummaryExtraction](),
		}),
		workflow.ActionStep(workflow.ActionStepConfig[saveThreadSummaryTemplate]{
			ID:   "save_summary",
			Name: "Save Thread Summary",
			Type: "mail.save_thread_summary",
			Sources: map[string]workflow.SourceBinding{
				"thread": workflow.Source(workflow.SourceConfig[GetThreadParams]{
					Loader:   "mail.thread",
					Params:   GetThreadParams{ID: "{{ input.thread_id }}"},
					Required: true,
				}),
			},
			Inputs: saveThreadSummaryTemplate{
				ThreadID:      "{{ input.thread_id }}",
				Language:      "{{ input.?language.orValue('en') }}",
				TLDR:          "{{ steps.summarize_thread.tldr }}",
				KeyPoints:     "{{ steps.summarize_thread.key_points }}",
				ActionItems:   "{{ steps.summarize_thread.action_items }}",
				LastMessageID: "{{ sources.thread.last_message_id }}",
				LastMessageAt: "{{ sources.thread.last_message_at }}",
				MessageCount:  "{{ sources.thread.message_count }}",
			},
		}),
		workflow.OutputStep(workflow.OutputStepConfig{
			ID:   "return_summary",
			Name: "Return Thread Summary",
			Value: summarizeThreadOutputTemplate{
				ThreadID: "{{ input.thread_id }}",
				Language: "{{ input.?language.orValue('en') }}",
				Summary:  "{{ toJSON(steps.summarize_thread) }}",
			},
		}),
	}

	flow := &workflow.Flow{
		SpaceID:     spaceID,
		SystemKey:   new(SystemFlowMailSummarizeThread),
		IsSystem:    true,
		IsEnabled:   true,
		Name:        "Summarize Email Thread",
		Description: "Summarizes an email thread into a TL;DR, key points, and action items, caching the result per language for in-place reading.",
		Config: workflow.FlowConfig{
			DefaultModel: &workflow.ModelConfig{Role: new("fast")},
		},
		InputSchema: workflow.SchemaFor[SummarizeThreadFlowInput](),
		Steps:       steps,
	}

	triggers := []workflow.Trigger{
		{
			SpaceID:   spaceID,
			Name:      "Summarize Email Thread",
			Type:      workflow.TriggerManual,
			IsEnabled: true,
		},
		{
			SpaceID:   spaceID,
			Name:      "Auto-Summarize On New Message",
			Type:      workflow.TriggerEvent,
			IsEnabled: false,
			Config: workflow.TriggerConfig{
				Topic: new("mail.message.received"),
				InputMapping: workflow.StructToMap(autoSummarizeTriggerMapping{
					ThreadID: "{{ trigger.data.message.thread_id }}",
				}),
			},
		},
	}

	return flow, triggers
}

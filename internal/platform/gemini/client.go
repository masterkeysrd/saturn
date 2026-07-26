package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// ParsedEmailMetadata holds the structured output returned by the LLM ingestion parser.
type ParsedEmailMetadata struct {
	Amount          int64  `json:"amount"`
	Currency        string `json:"currency"`
	Vendor          string `json:"vendor"`
	CardLastFour    string `json:"card_last_four"`
	Date            string `json:"date"`
	SuggestedBudget string `json:"suggested_budget"`
}

// Client implements the Gemini structured content generation calls.
type Client struct {
	apiKey string
	client *http.Client
}

// NewClient instantiates a new Gemini Client.
func NewClient() *Client {
	return &Client{
		apiKey: os.Getenv("GEMINI_API_KEY"),
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// ParseEmail parses unstructured SMTP email alerts using structured LLM JSON outputs.
func (c *Client) ParseEmail(ctx context.Context, emailBody string, activeBudgets []string) (*ParsedEmailMetadata, error) {
	// If API key is empty, run in Mock Mode for easy offline development and local E2E simulation!
	if c.apiKey == "" {
		return c.parseMock(emailBody, activeBudgets)
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s", c.apiKey)

	prompt := fmt.Sprintf(`You are a financial transaction extraction assistant.
Extract transaction details from this email notification.
Map it to one of the following active budgets if there is a match: %s.

Email:
%s`, strings.Join(activeBudgets, ", "), emailBody)

	reqPayload := map[string]any{
		"contents": []any{
			map[string]any{
				"parts": []any{
					map[string]any{
						"text": prompt,
					},
				},
			},
		},
		"generationConfig": map[string]any{
			"responseMimeType": "application/json",
			"responseSchema": map[string]any{
				"type": "OBJECT",
				"properties": map[string]any{
					"amount": map[string]any{
						"type":        "INTEGER",
						"description": "amount in minor units (e.g. cents, 45.00 becomes 4500)",
					},
					"currency": map[string]any{
						"type":        "STRING",
						"description": "3-letter currency code in uppercase (e.g. USD, EUR)",
					},
					"vendor": map[string]any{
						"type":        "STRING",
						"description": "clean commercial name of the merchant",
					},
					"card_last_four": map[string]any{
						"type":        "STRING",
						"description": "last 4 digits of card used (e.g. 1234), or empty string if not found",
					},
					"date": map[string]any{
						"type":        "STRING",
						"description": "ISO-8601 transaction timestamp, or current time if not found",
					},
					"suggested_budget": map[string]any{
						"type":        "STRING",
						"description": "the EXACT budget name from the provided list that fits best, or empty string",
					},
				},
				"required": []string{"amount", "currency", "vendor", "date"},
			},
		},
	}

	payloadBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("gemini api returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var response struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("decode gemini response: %w", err)
	}

	if len(response.Candidates) == 0 || len(response.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("empty response candidates from gemini")
	}

	text := response.Candidates[0].Content.Parts[0].Text

	var metadata ParsedEmailMetadata
	if err := json.Unmarshal([]byte(text), &metadata); err != nil {
		return nil, fmt.Errorf("unmarshal extracted JSON metadata: %w (raw response: %s)", err, text)
	}

	return &metadata, nil
}

func (c *Client) parseMock(emailBody string, activeBudgets []string) (*ParsedEmailMetadata, error) {
	lowerBody := strings.ToLower(emailBody)
	vendor := "Unknown Vendor"
	if strings.Contains(lowerBody, "netflix") {
		vendor = "Netflix"
	} else if strings.Contains(lowerBody, "uber") {
		vendor = "Uber"
	} else if strings.Contains(lowerBody, "starbucks") {
		vendor = "Starbucks"
	} else if strings.Contains(lowerBody, "chase") {
		vendor = "Chase Alert"
	}

	amount := int64(1500)
	if strings.Contains(lowerBody, "45.00") || strings.Contains(lowerBody, "45") {
		amount = 4500
	} else if strings.Contains(lowerBody, "9.99") {
		amount = 999
	} else if strings.Contains(lowerBody, "120.00") {
		amount = 12000
	}

	currency := "USD"
	if strings.Contains(lowerBody, "dop") {
		currency = "DOP"
	} else if strings.Contains(lowerBody, "eur") {
		currency = "EUR"
	}

	card := ""
	if strings.Contains(lowerBody, "1234") {
		card = "1234"
	} else if strings.Contains(lowerBody, "4321") {
		card = "4321"
	}

	suggestedBudget := ""
	for _, b := range activeBudgets {
		if strings.Contains(strings.ToLower(b), "entertainment") && vendor == "Netflix" {
			suggestedBudget = b
			break
		}
		if strings.Contains(strings.ToLower(b), "food") && vendor == "Starbucks" {
			suggestedBudget = b
			break
		}
		if strings.Contains(strings.ToLower(b), "transport") && vendor == "Uber" {
			suggestedBudget = b
			break
		}
	}

	return &ParsedEmailMetadata{
		Amount:          amount,
		Currency:        currency,
		Vendor:          vendor,
		CardLastFour:    card,
		Date:            time.Now().Format(time.RFC3339),
		SuggestedBudget: suggestedBudget,
	}, nil
}

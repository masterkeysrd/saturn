package driver

import (
	"strings"
	"testing"

	"google.golang.org/protobuf/types/known/emptypb"

	"github.com/masterkeysrd/saturn/apis/saturn"
	agentv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/agent/v1"
)

// AgentDriver provides methods for managing LLM providers, agent blueprints, and AI suggestions.
type AgentDriver struct {
	driver      *Driver
	client      *agentv1.Client
	lastToken   string
	lastSpaceID string
}

func (a *AgentDriver) getClient() *agentv1.Client {
	if a.client == nil || a.lastToken != a.driver.state.AccessToken || a.lastSpaceID != a.driver.state.SpaceID {
		a.lastToken = a.driver.state.AccessToken
		a.lastSpaceID = a.driver.state.SpaceID
		a.client = agentv1.NewClient(saturn.Config{
			BaseURL:     a.driver.env.ServerURL,
			AccessToken: a.lastToken,
			SpaceID:     a.lastSpaceID,
			HTTPClient:  a.driver.httpClient,
		})
	}
	return a.client
}

// CreateProviderOptions encapsulates options for creating an LLM provider.
type CreateProviderOptions struct {
	Name              string
	CompatibilityMode string
	APIUrl            string
	APIKey            string
	ExpectErr         string
	Assert            func(tb testing.TB, p *agentv1.LLMProvider)
}

// UpdateProviderOptions encapsulates options for modifying an LLM provider.
type UpdateProviderOptions struct {
	ID        string
	Name      string
	APIUrl    string
	APIKey    string
	ExpectErr string
	Assert    func(tb testing.TB, p *agentv1.LLMProvider)
}

// CreateAgentOptions encapsulates options for creating an agent instance.
type CreateAgentOptions struct {
	Name              string
	Description       string
	Purpose           string
	Tags              []string
	ModelName         string
	SystemInstruction string
	Temperature       float64
	LLMProviderID     string
	ExpectErr         string
	Assert            func(tb testing.TB, a *agentv1.Agent)
}

// UpdateAgentOptions encapsulates options for updating an agent instance.
type UpdateAgentOptions struct {
	ID                string
	Name              string
	Description       string
	Tags              []string
	ModelName         string
	SystemInstruction string
	Temperature       float64
	LLMProviderID     string
	IsEnabled         bool
	ExpectErr         string
	Assert            func(tb testing.TB, a *agentv1.Agent)
}

// ListAgentRunsOptions encapsulates options for listing audit runs.
type ListAgentRunsOptions struct {
	AgentID   string
	PageSize  int32
	PageToken string
	ExpectErr string
	Assert    func(tb testing.TB, resp *agentv1.ListAgentRunsResponse)
}

// GetSuggestionsOptions encapsulates options for requesting AI suggestions.
type GetSuggestionsOptions struct {
	Purpose     string
	TextContent string
	Documents   []*agentv1.DocumentFilePayload
	ExpectErr   string
	Assert      func(tb testing.TB, resp *agentv1.GetSuggestionsResponse)
}

// CreateProvider registers a new LLM provider connection in the active space.
func (a *AgentDriver) CreateProvider(tb testing.TB, opts CreateProviderOptions) (*agentv1.LLMProvider, error) {
	tb.Helper()
	client := a.getClient()
	p, err := client.CreateProvider(tb.Context(), &agentv1.CreateProviderRequest{
		Name:              opts.Name,
		CompatibilityMode: opts.CompatibilityMode,
		ApiUrl:            opts.APIUrl,
		ApiKey:            opts.APIKey,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("CreateProvider succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateProvider error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if p != nil {
		a.driver.state.LastProviderID = p.GetId()
	}
	if opts.Assert != nil {
		opts.Assert(tb, p)
	}
	return p, nil
}

// GetProvider fetches an LLM provider by ID.
func (a *AgentDriver) GetProvider(tb testing.TB, id string) (*agentv1.LLMProvider, error) {
	tb.Helper()
	client := a.getClient()
	return client.GetProvider(tb.Context(), &agentv1.GetProviderRequest{
		Id: id,
	})
}

// ListProviders retrieves all LLM providers configured in the active space.
func (a *AgentDriver) ListProviders(tb testing.TB) (*agentv1.ListProvidersResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.ListProviders(tb.Context(), &emptypb.Empty{})
}

// UpdateProvider updates existing LLM provider parameters.
func (a *AgentDriver) UpdateProvider(tb testing.TB, opts UpdateProviderOptions) (*agentv1.LLMProvider, error) {
	tb.Helper()
	client := a.getClient()
	p, err := client.UpdateProvider(tb.Context(), &agentv1.UpdateProviderRequest{
		Id:     opts.ID,
		Name:   opts.Name,
		ApiUrl: opts.APIUrl,
		ApiKey: opts.APIKey,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("UpdateProvider succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("UpdateProvider error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if opts.Assert != nil {
		opts.Assert(tb, p)
	}
	return p, nil
}

// DeleteProvider removes an LLM provider configuration.
func (a *AgentDriver) DeleteProvider(tb testing.TB, id string) error {
	tb.Helper()
	client := a.getClient()
	_, err := client.DeleteProvider(tb.Context(), &agentv1.DeleteProviderRequest{
		Id: id,
	})
	return err
}

// CreateAgent registers an agent blueprint instance.
func (a *AgentDriver) CreateAgent(tb testing.TB, opts CreateAgentOptions) (*agentv1.Agent, error) {
	tb.Helper()
	client := a.getClient()
	agent, err := client.CreateAgent(tb.Context(), &agentv1.CreateAgentRequest{
		Name:              opts.Name,
		Description:       opts.Description,
		Purpose:           opts.Purpose,
		Tags:              opts.Tags,
		ModelName:         opts.ModelName,
		SystemInstruction: opts.SystemInstruction,
		Temperature:       opts.Temperature,
		LlmProviderId:     opts.LLMProviderID,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("CreateAgent succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateAgent error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if agent != nil {
		a.driver.state.LastAgentID = agent.GetId()
	}
	if opts.Assert != nil {
		opts.Assert(tb, agent)
	}
	return agent, nil
}

// GetAgent fetches an agent blueprint instance by ID.
func (a *AgentDriver) GetAgent(tb testing.TB, id string) (*agentv1.Agent, error) {
	tb.Helper()
	client := a.getClient()
	return client.GetAgent(tb.Context(), &agentv1.GetAgentRequest{
		Id: id,
	})
}

// ListAgents lists all agents registered in the active space.
func (a *AgentDriver) ListAgents(tb testing.TB) (*agentv1.ListAgentsResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.ListAgents(tb.Context(), &emptypb.Empty{})
}

// UpdateAgent updates an existing agent blueprint configuration.
func (a *AgentDriver) UpdateAgent(tb testing.TB, opts UpdateAgentOptions) (*agentv1.Agent, error) {
	tb.Helper()
	client := a.getClient()
	agent, err := client.UpdateAgent(tb.Context(), &agentv1.UpdateAgentRequest{
		Id:                opts.ID,
		Name:              opts.Name,
		Description:       opts.Description,
		Tags:              opts.Tags,
		ModelName:         opts.ModelName,
		SystemInstruction: opts.SystemInstruction,
		Temperature:       opts.Temperature,
		LlmProviderId:     opts.LLMProviderID,
		IsEnabled:         opts.IsEnabled,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("UpdateAgent succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("UpdateAgent error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if opts.Assert != nil {
		opts.Assert(tb, agent)
	}
	return agent, nil
}

// DeleteAgent deletes an agent blueprint configuration.
func (a *AgentDriver) DeleteAgent(tb testing.TB, id string) error {
	tb.Helper()
	client := a.getClient()
	_, err := client.DeleteAgent(tb.Context(), &agentv1.DeleteAgentRequest{
		Id: id,
	})
	return err
}

// ListAgentRuns queries execution history and audit logs for an agent.
func (a *AgentDriver) ListAgentRuns(tb testing.TB, opts ListAgentRunsOptions) (*agentv1.ListAgentRunsResponse, error) {
	tb.Helper()
	client := a.getClient()
	resp, err := client.ListAgentRuns(tb.Context(), &agentv1.ListAgentRunsRequest{
		AgentId:   opts.AgentID,
		PageSize:  opts.PageSize,
		PageToken: opts.PageToken,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("ListAgentRuns succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("ListAgentRuns error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if opts.Assert != nil {
		opts.Assert(tb, resp)
	}
	return resp, nil
}

// GetAgentCatalog retrieves the system-supported agent blueprint descriptors.
func (a *AgentDriver) GetAgentCatalog(tb testing.TB) (*agentv1.GetAgentCatalogResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.GetAgentCatalog(tb.Context(), &emptypb.Empty{})
}

// GetProviderCatalog retrieves the system-supported LLM connection blueprints.
func (a *AgentDriver) GetProviderCatalog(tb testing.TB) (*agentv1.GetProviderCatalogResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.GetProviderCatalog(tb.Context(), &emptypb.Empty{})
}

// GetSuggestions dispatches a suggestion request to the registered processor for the given purpose.
func (a *AgentDriver) GetSuggestions(tb testing.TB, opts GetSuggestionsOptions) (*agentv1.GetSuggestionsResponse, error) {
	tb.Helper()
	client := a.getClient()
	resp, err := client.GetSuggestions(tb.Context(), &agentv1.GetSuggestionsRequest{
		Purpose:     opts.Purpose,
		TextContent: opts.TextContent,
		Documents:   opts.Documents,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("GetSuggestions succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("GetSuggestions error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	if opts.Assert != nil {
		opts.Assert(tb, resp)
	}
	return resp, nil
}

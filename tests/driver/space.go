package driver

import (
	"testing"

	"github.com/masterkeysrd/saturn/apis/saturn"
	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
)

// SpaceDriver provides fluent methods for space management using spacev1.Client.
type SpaceDriver struct {
	driver    *Driver
	client    *spacev1.Client
	lastToken string
}

func (s *SpaceDriver) getClient() *spacev1.Client {
	if s.client == nil || s.lastToken != s.driver.state.AccessToken {
		s.lastToken = s.driver.state.AccessToken
		s.client = spacev1.NewClient(saturn.Config{
			BaseURL:     s.driver.env.ServerURL,
			AccessToken: s.lastToken,
			HTTPClient:  s.driver.httpClient,
		})
	}
	return s.client
}

// Ensure creates or selects a workspace and sets it as active in session state.
func (s *SpaceDriver) Ensure(tb testing.TB, spaceName string) *SpaceDriver {
	tb.Helper()
	if tb.Failed() {
		return s
	}
	client := s.getClient()

	space, err := client.CreateSpace(tb.Context(), &spacev1.CreateSpaceRequest{
		Name: spaceName,
	})
	if err != nil {
		tb.Fatalf("CreateSpace SDK call failed: %v", err)
	}

	s.driver.state.SpaceID = space.GetId()
	return s
}

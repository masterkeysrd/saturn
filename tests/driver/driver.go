package driver

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"
)

// Driver is the root test driver providing state, sub-driver accessors, and database resetting.
type Driver struct {
	t          *testing.T
	env        *TestEnv
	state      *State
	httpClient *http.Client

	authSubdriver    *AuthDriver
	spaceSubdriver   *SpaceDriver
	financeSubdriver *FinanceDriver
}

// New creates a fresh Driver instance for a test run and automatically resets the database.
func New(t *testing.T, env *TestEnv) *Driver {
	d := &Driver{
		t:          t,
		env:        env,
		state:      newState(t),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}

	d.authSubdriver = &AuthDriver{driver: d}
	d.spaceSubdriver = &SpaceDriver{driver: d}
	d.financeSubdriver = &FinanceDriver{driver: d}

	// Auto-reset database & state before each test
	d.ResetDB()

	t.Cleanup(func() {
		d.ResetDB()
	})

	return d
}

// Auth returns the Auth domain sub-driver.
func (d *Driver) Auth() *AuthDriver {
	return d.authSubdriver
}

// Space returns the Space domain sub-driver.
func (d *Driver) Space() *SpaceDriver {
	return d.spaceSubdriver
}

// Finance returns the Finance domain sub-driver.
func (d *Driver) Finance() *FinanceDriver {
	return d.financeSubdriver
}

const truncateSQL = `
TRUNCATE TABLE 
    finance.transaction_events,
    finance.transaction,
    finance.borrowing,
    finance.scheduled_payment,
    finance.recurring_expense,
    finance.budget_period,
    finance.budget,
    finance.account,
    finance.transfer,
    finance.inbox_item,
    finance.settings,
    space.member,
    space.space,
    identity.sessions,
    identity.security_events,
    identity.user_credentials,
    identity.user
RESTART IDENTITY CASCADE;
`

// ResetDB truncates all database tables in ~5ms and resets driver session state.
func (d *Driver) ResetDB() *Driver {
	if d.t.Failed() {
		return d
	}
	if d.env != nil {
		d.env.adminToken = ""
		if d.env.DB != nil {
			_, err := d.env.DB.Exec(truncateSQL)
			if err != nil {
				d.t.Fatalf("failed to truncate test database: %v", err)
			}
		}
	}
	d.state.ClearRegistries()
	return d
}

// doRequest performs an HTTP request against the Saturn test server.
func (d *Driver) doRequest(method, path string, payload any, target any, requireAuth bool) {
	if d.t.Failed() {
		return
	}

	var bodyReader io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			d.t.Fatalf("Failed to marshal JSON payload for %s %s: %v", method, path, err)
		}
		bodyReader = bytes.NewReader(data)
	}

	url := d.env.ServerURL + path
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		d.t.Fatalf("Failed to construct HTTP request %s %s: %v", method, path, err)
	}

	req.Header.Set("Content-Type", "application/json")
	if requireAuth && d.state.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+d.state.AccessToken)
	}
	if requireAuth && d.state.SpaceID != "" {
		req.Header.Set("Space-Id", d.state.SpaceID)
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		d.t.Fatalf("HTTP request %s %s failed: %v", method, path, err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		d.t.Fatalf("HTTP %s %s returned error status %d: %s", method, path, resp.StatusCode, string(respBody))
	}

	if target != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, target); err != nil {
			d.t.Fatalf("Failed to unmarshal response for %s %s: %v (raw body: %s)", method, path, err, string(respBody))
		}
	}
}

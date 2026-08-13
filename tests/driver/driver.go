package driver

import (
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

	authSubdriver     *AuthDriver
	spaceSubdriver    *SpaceDriver
	financeSubdriver  *FinanceDriver
	platformSubdriver *PlatformDriver
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
	d.platformSubdriver = &PlatformDriver{driver: d}

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

// Platform returns the Platform domain sub-driver.
func (d *Driver) Platform() *PlatformDriver {
	return d.platformSubdriver
}

const truncateSQL = `
TRUNCATE TABLE 
    finance.transaction_events,
    finance.transaction,
    finance.borrowing,
    finance.scheduled_transaction,
    finance.recurring_transaction,
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

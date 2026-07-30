package tests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"
)

// TestDriver provides a fluent, stateful test driver for integration testing Saturn endpoints.
type TestDriver struct {
	t            *testing.T
	baseURL      string
	httpClient   *http.Client
	accessToken  string
	spaceID      string
	userEmail    string
	userPassword string
	accountID    string
	borrowingID  string
	repaymentID  string
	lastError    error
}

// NewDriver initializes a new test driver targeting the given base URL (e.g. "http://localhost:8080").
func NewDriver(t *testing.T, baseURL string) *TestDriver {
	return &TestDriver{
		t:          t,
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// SetAccessToken allows manually setting an auth token.
func (d *TestDriver) SetAccessToken(token string) *TestDriver {
	d.accessToken = token
	return d
}

// SetSpaceID allows manually setting the active space ID.
func (d *TestDriver) SetSpaceID(spaceID string) *TestDriver {
	d.spaceID = spaceID
	return d
}

// CreateValidUser registers a new user with random credentials.
func (d *TestDriver) CreateValidUser() *TestDriver {
	if d.t.Failed() {
		return d
	}
	d.userEmail = fmt.Sprintf("testuser_%d@saturn.local", time.Now().UnixNano())
	d.userPassword = "Password123!"

	payload := map[string]interface{}{
		"name":     "Integration Test User",
		"email":    d.userEmail,
		"username": fmt.Sprintf("user_%d", time.Now().UnixNano()),
		"password": d.userPassword,
	}

	var resp map[string]interface{}
	d.doRequest("POST", "/api/v1/identity/users:register", payload, &resp, false)
	return d
}

// LoginUser authenticates the user and captures the session access token.
func (d *TestDriver) LoginUser() *TestDriver {
	if d.t.Failed() {
		return d
	}
	payload := map[string]interface{}{
		"userPassword": map[string]string{
			"identifier": d.userEmail,
			"password":   d.userPassword,
		},
	}

	var resp map[string]interface{}
	d.doRequest("POST", "/api/v1/identity/users:login", payload, &resp, false)

	if token, ok := resp["accessToken"].(string); ok && token != "" {
		d.accessToken = token
	}
	return d
}

// EnsureSpace creates or selects a workspace.
func (d *TestDriver) EnsureSpace(spaceName string) *TestDriver {
	if d.t.Failed() {
		return d
	}
	payload := map[string]interface{}{
		"name": spaceName,
	}

	var resp map[string]interface{}
	d.doRequest("POST", "/api/v1/spaces", payload, &resp, true)

	if id, ok := resp["id"].(string); ok && id != "" {
		d.spaceID = id
	}
	return d
}

// CreateAccount creates a financial account and saves its ID.
func (d *TestDriver) CreateAccount(name, accountType, currency string, initialBalance int64) *TestDriver {
	if d.t.Failed() {
		return d
	}
	payload := map[string]interface{}{
		"account": map[string]interface{}{
			"name":           name,
			"type":           accountType,
			"currency":       currency,
			"initialBalance": fmt.Sprintf("%d", initialBalance),
		},
	}

	var resp map[string]interface{}
	d.doRequest("POST", "/api/v1/finance/accounts", payload, &resp, true)

	if id, ok := resp["id"].(string); ok && id != "" {
		d.accountID = id
	}
	return d
}

// CreateBorrowing creates a borrowing agreement and saves its ID.
func (d *TestDriver) CreateBorrowing(counterparty, direction, currency string, amount int64) *TestDriver {
	if d.t.Failed() {
		return d
	}
	payload := map[string]interface{}{
		"borrowing": map[string]interface{}{
			"counterparty": counterparty,
			"direction":    direction,
			"currency":     currency,
			"totalAmount":  fmt.Sprintf("%d", amount),
		},
	}

	var resp map[string]interface{}
	d.doRequest("POST", "/api/v1/finance/borrowings", payload, &resp, true)

	if id, ok := resp["id"].(string); ok && id != "" {
		d.borrowingID = id
	}
	return d
}

// CreateBorrowingRepayment registers a repayment against the current borrowing.
func (d *TestDriver) CreateBorrowingRepayment(amount int64, notes string) *TestDriver {
	if d.t.Failed() {
		return d
	}
	payload := map[string]interface{}{
		"repayment": map[string]interface{}{
			"borrowingId": d.borrowingID,
			"amount":      fmt.Sprintf("%d", amount),
			"accountId":   d.accountID,
			"notes":       notes,
			"paymentDate": time.Now().Format(time.RFC3339),
		},
	}

	url := fmt.Sprintf("/api/v1/finance/borrowings/%s/repayments", d.borrowingID)
	var resp map[string]interface{}
	d.doRequest("POST", url, payload, &resp, true)

	if id, ok := resp["id"].(string); ok && id != "" {
		d.repaymentID = id
	}
	return d
}

// DeleteBorrowingRepayment deletes the last registered repayment.
func (d *TestDriver) DeleteBorrowingRepayment() *TestDriver {
	if d.t.Failed() {
		return d
	}
	url := fmt.Sprintf("/api/v1/finance/borrowings/%s/repayments/%s", d.borrowingID, d.repaymentID)
	var resp map[string]interface{}
	d.doRequest("DELETE", url, nil, &resp, true)
	return d
}

// AssertAccountBalance verifies the account balance matches expected.
func (d *TestDriver) AssertAccountBalance(expectedBalance int64) *TestDriver {
	if d.t.Failed() {
		return d
	}
	url := fmt.Sprintf("/api/v1/finance/accounts/%s", d.accountID)
	var resp map[string]interface{}
	d.doRequest("GET", url, nil, &resp, true)

	if balanceStr, ok := resp["currentBalance"].(string); ok {
		var balance int64
		fmt.Sscanf(balanceStr, "%d", &balance)
		if balance != expectedBalance {
			d.t.Errorf("Account balance = %d, want %d", balance, expectedBalance)
		}
	}
	return d
}

// AssertBorrowingRemainingAmount verifies the remaining borrowing amount matches expected.
func (d *TestDriver) AssertBorrowingRemainingAmount(expectedRemaining int64) *TestDriver {
	if d.t.Failed() {
		return d
	}
	url := fmt.Sprintf("/api/v1/finance/borrowings/%s", d.borrowingID)
	var resp map[string]interface{}
	d.doRequest("GET", url, nil, &resp, true)

	if remainingStr, ok := resp["remainingAmount"].(string); ok {
		var remaining int64
		fmt.Sscanf(remainingStr, "%d", &remaining)
		if remaining != expectedRemaining {
			d.t.Errorf("Borrowing remaining amount = %d, want %d", remaining, expectedRemaining)
		}
	}
	return d
}

// Helper method for executing HTTP requests against the backend endpoints.
func (d *TestDriver) doRequest(method, path string, payload interface{}, target interface{}, requireAuth bool) {
	var bodyReader io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			d.t.Fatalf("Failed to marshal payload: %v", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, d.baseURL+path, bodyReader)
	if err != nil {
		d.t.Fatalf("Failed to create HTTP request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if requireAuth && d.accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+d.accessToken)
	}
	if requireAuth && d.spaceID != "" {
		req.Header.Set("Space-Id", d.spaceID)
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		d.t.Fatalf("HTTP request %s %s failed: %v", method, path, err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		d.t.Fatalf("HTTP %s %s returned status %d: %s", method, path, resp.StatusCode, string(respBody))
	}

	if target != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, target); err != nil {
			d.t.Fatalf("Failed to unmarshal HTTP response: %v", err)
		}
	}
}

package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAPIV1HandlerStripsAPIPrefix(t *testing.T) {
	var receivedPath string
	handler := apiV1Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}))

	request := httptest.NewRequest(http.MethodPost, "/api/v1/identity/users:register?source=swagger", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
	}
	if receivedPath != "/v1/identity/users:register" {
		t.Fatalf("path = %q, want %q", receivedPath, "/v1/identity/users:register")
	}
}

func TestAPISwaggerJSONAddsBasePathAndNormalizesPaths(t *testing.T) {
	data := []byte(`{
		"swagger":"2.0",
		"info":{"title":"Saturn"},
		"paths":{
			"/api/v1/identity/users:login":{"post":{}},
			"/v1/identity/users:register":{"post":{}}
		}
	}`)

	result, err := apiSwaggerJSON(data)
	if err != nil {
		t.Fatalf("apiSwaggerJSON() error = %v", err)
	}

	var document struct {
		BasePath string                     `json:"basePath"`
		Info     json.RawMessage            `json:"info"`
		Paths    map[string]json.RawMessage `json:"paths"`
	}
	if err := json.Unmarshal(result, &document); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}

	if document.BasePath != "/api" {
		t.Fatalf("basePath = %q, want %q", document.BasePath, "/api")
	}
	if document.Info == nil {
		t.Fatal("info was removed from the Swagger document")
	}
	if _, ok := document.Paths["/v1/identity/users:login"]; !ok {
		t.Fatal("normalized login path is missing")
	}
	if _, ok := document.Paths["/v1/identity/users:register"]; !ok {
		t.Fatal("existing v1 path is missing")
	}
	if _, ok := document.Paths["/api/v1/identity/users:login"]; ok {
		t.Fatal("api-prefixed path was not normalized")
	}
}

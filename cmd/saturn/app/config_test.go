package app

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestConfig_EncryptionKeyBinding(t *testing.T) {
	os.Setenv("SATURN_SECURITY_ENCRYPTION_KEY", "prod-secret-key-1234567890123456")
	defer os.Unsetenv("SATURN_SECURITY_ENCRYPTION_KEY")

	v := NewViper()
	cfg := LoadConfig(v)

	if cfg.Security.EncryptionKey != "prod-secret-key-1234567890123456" {
		t.Errorf("expected Security.EncryptionKey to be 'prod-secret-key-1234567890123456', got %q", cfg.Security.EncryptionKey)
	}
}

func TestDBConfig_DSN(t *testing.T) {
	tests := []struct {
		name string
		cfg  DBConfig
		want string
	}{
		{
			name: "defaults sslmode=require and includes application_name=saturn",
			cfg: DBConfig{
				Host:     "saturn-db",
				Port:     5432,
				User:     "saturn_prod",
				Password: "secret",
				Name:     "saturn_prod",
			},
			want: "postgres://saturn_prod:secret@saturn-db:5432/saturn_prod?application_name=saturn&sslmode=require",
		},
		{
			name: "honors explicit sslmode=disable and URL-encodes special password characters",
			cfg: DBConfig{
				Host:     "localhost",
				Port:     5432,
				User:     "saturn",
				Password: "p@ss/w:rd#1",
				Name:     "saturn",
				SSLMode:  "disable",
			},
			want: "postgres://saturn:p%40ss%2Fw%3Ard%231@localhost:5432/saturn?application_name=saturn&sslmode=disable",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.cfg.DSN(); got != tt.want {
				t.Errorf("DBConfig.DSN() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestConfig_DBPoolEnvBindings(t *testing.T) {
	tests := []struct {
		name         string
		env          map[string]string
		wantOpen     int
		wantIdle     int
		wantIdleTime time.Duration
		wantLifetime time.Duration
	}{
		{
			name:         "defaults when env vars unset",
			env:          nil,
			wantOpen:     25,
			wantIdle:     10,
			wantIdleTime: 5 * time.Minute,
			wantLifetime: 15 * time.Minute,
		},
		{
			name: "overrides from SATURN_DB_* environment variables",
			env: map[string]string{
				"SATURN_DB_MAX_OPEN_CONNS":     "8",
				"SATURN_DB_MAX_IDLE_CONNS":     "4",
				"SATURN_DB_CONN_MAX_IDLE_TIME": "1m",
				"SATURN_DB_CONN_MAX_LIFETIME":  "10m",
			},
			wantOpen:     8,
			wantIdle:     4,
			wantIdleTime: time.Minute,
			wantLifetime: 10 * time.Minute,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for k, val := range tt.env {
				t.Setenv(k, val)
			}

			v := NewViper()
			cfg := LoadConfig(v)

			if cfg.DB.MaxOpenConns != tt.wantOpen {
				t.Errorf("MaxOpenConns = %d, want %d", cfg.DB.MaxOpenConns, tt.wantOpen)
			}
			if cfg.DB.MaxIdleConns != tt.wantIdle {
				t.Errorf("MaxIdleConns = %d, want %d", cfg.DB.MaxIdleConns, tt.wantIdle)
			}
			if cfg.DB.ConnMaxIdleTime != tt.wantIdleTime {
				t.Errorf("ConnMaxIdleTime = %v, want %v", cfg.DB.ConnMaxIdleTime, tt.wantIdleTime)
			}
			if cfg.DB.ConnMaxLifetime != tt.wantLifetime {
				t.Errorf("ConnMaxLifetime = %v, want %v", cfg.DB.ConnMaxLifetime, tt.wantLifetime)
			}
		})
	}
}

func TestConfig_AIMCPAllowPrivateNetworks(t *testing.T) {
	v := NewViper()
	cfg := LoadConfig(v)
	if cfg.AI.MCP.AllowPrivateNetworks {
		t.Fatalf("expected AI.MCP.AllowPrivateNetworks default to be false")
	}

	t.Setenv("SATURN_AI_MCP_ALLOW_PRIVATE_NETWORKS", "true")
	v2 := NewViper()
	cfg2 := LoadConfig(v2)
	if !cfg2.AI.MCP.AllowPrivateNetworks {
		t.Fatalf("expected AI.MCP.AllowPrivateNetworks=true from env override")
	}
}

func TestConnectorConfig_ResolvedAllowedReturnOrigins(t *testing.T) {
	cfg := ConnectorConfig{
		PublicCallbackBaseURL: "https://api.saturn.example/v1/platform/connectors/oauth",
		AllowedReturnOrigins:  []string{"https://app.saturn.example/", "https://API.saturn.example", "invalid"},
	}
	got := cfg.ResolvedAllowedReturnOrigins()
	want := []string{"https://app.saturn.example", "https://api.saturn.example"}
	if len(got) != len(want) {
		t.Fatalf("ResolvedAllowedReturnOrigins() = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("ResolvedAllowedReturnOrigins()[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestGRPCServer_StartRequiresEncryptionKey(t *testing.T) {
	srv := NewGRPCServer(&Config{})
	err := srv.Start(context.Background(), &Config{}, nil)
	if err == nil {
		t.Fatal("expected GRPCServer.Start to fail when Security.EncryptionKey is empty")
	}
}

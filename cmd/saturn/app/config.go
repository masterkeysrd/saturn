package app

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/log"

	"github.com/spf13/pflag"
	"github.com/spf13/viper"
)

const (
	defaultDBHost        = "localhost"
	defaultDBPort        = 5432
	defaultDBUser        = "saturn"
	defaultDBPassword    = "saturn"
	defaultDBName        = "saturn"
	defaultGRPCSocket    = "/tmp/saturn-identity.sock"
	defaultGatewayAddr   = ":8080"
	defaultRoutePrefix   = "/api/v1"
	defaultShutdownTime  = 10 * time.Second
	defaultLogLevel      = "info"
	defaultConfigName    = "saturn"
	defaultConfigDir     = "."
	defaultConfigHomeDir = "$HOME/.config/saturn"
	defaultEnvPrefix     = "SATURN"
	defaultSwaggerPath   = "/swagger"

	defaultJWTIssuer      = "saturn"
	defaultJWTAudience    = "saturn-api"
	defaultJWTAccessTTL   = 15 * time.Minute
	defaultJWTClockSkew   = 30 * time.Second
	defaultJWTActiveKeyID = "key-1"
	defaultJWTKeyDir      = "./keys"
)

var logLevels = map[string]log.Level{
	"debug": log.LevelDebug,
	"info":  log.LevelInfo,
	"warn":  log.LevelWarn,
	"error": log.LevelError,
}

// Config holds all application configuration, organized by subsystem.
type Config struct {
	DB        DBConfig
	GRPC      GRPCConfig
	Gateway   GatewayConfig
	Shutdown  ShutdownConfig
	Log       LogConfig
	Swagger   SwaggerConfig
	Auth      AuthConfig
	Backup    BackupConfig
	Security  SecurityConfig
	Connector ConnectorConfig
}

// ConnectorConfig holds instance-level OAuth connector configurations.
type ConnectorConfig struct {
	PublicCallbackBaseURL string                   `mapstructure:"public_callback_base_url"`
	Google                GoogleConnectorConfig    `mapstructure:"google"`
	Microsoft             MicrosoftConnectorConfig `mapstructure:"microsoft"`
}

// CallbackURL returns the OAuth redirect callback URI for the given provider.
func (c *ConnectorConfig) CallbackURL(provider string) string {
	base := strings.TrimRight(c.PublicCallbackBaseURL, "/")
	if base == "" {
		base = "http://localhost:8080/v1/platform/connectors/oauth"
	}
	return fmt.Sprintf("%s/%s/callback", base, provider)
}

// GoogleConnectorConfig holds Google OAuth2 credentials and optional endpoint URL overrides.
type GoogleConnectorConfig struct {
	ClientID     string `mapstructure:"client_id"`
	ClientSecret string `mapstructure:"client_secret"`
	RedirectURI  string `mapstructure:"redirect_uri"`
	AuthURL      string `mapstructure:"auth_url"`
	TokenURL     string `mapstructure:"token_url"`
	RevokeURL    string `mapstructure:"revoke_url"`
	UserinfoURL  string `mapstructure:"userinfo_url"`
	PeopleURL    string `mapstructure:"people_url"`
	OtherURL     string `mapstructure:"other_url"`
	CalendarURL  string `mapstructure:"calendar_url"`
	GmailURL     string `mapstructure:"gmail_url"`
}

// ResolvedRedirectURI returns the configured RedirectURI or constructs it from the base callback URL.
func (g *GoogleConnectorConfig) ResolvedRedirectURI(base *ConnectorConfig) string {
	if g.RedirectURI != "" {
		return g.RedirectURI
	}
	return base.CallbackURL("google")
}

// MicrosoftConnectorConfig holds Microsoft OAuth2 credentials.
type MicrosoftConnectorConfig struct {
	ClientID     string `mapstructure:"client_id"`
	ClientSecret string `mapstructure:"client_secret"`
	TenantID     string `mapstructure:"tenant_id"`
}

// SecurityConfig holds encryption and security settings.
type SecurityConfig struct {
	EncryptionKey string `mapstructure:"encryption_key"`
}

// BackupConfig holds database backup and sync configurations.
type BackupConfig struct {
	Driver     string `mapstructure:"driver"`
	LocalDir   string `mapstructure:"local_dir"`
	S3Bucket   string `mapstructure:"s3_bucket"`
	S3Region   string `mapstructure:"s3_region"`
	S3Endpoint string `mapstructure:"s3_endpoint"`
}

// SwaggerConfig holds swagger UI settings.
type SwaggerConfig struct {
	Enabled bool   `mapstructure:"enabled"`
	Path    string `mapstructure:"path"`
}

// DBConfig holds database connection settings.
type DBConfig struct {
	Host            string        `mapstructure:"host"`
	Port            int           `mapstructure:"port"`
	User            string        `mapstructure:"user"`
	Password        string        `mapstructure:"password"`
	Name            string        `mapstructure:"name"`
	SSLMode         string        `mapstructure:"ssl_mode"`
	MaxOpenConns    int           `mapstructure:"max_open_conns"`
	MaxIdleConns    int           `mapstructure:"max_idle_conns"`
	ConnMaxLifetime time.Duration `mapstructure:"conn_max_lifetime"`
	ConnMaxIdleTime time.Duration `mapstructure:"conn_max_idle_time"`
}

// DSN returns the PostgreSQL data source name for connecting to the database.
func (c DBConfig) DSN() string {
	sslMode := strings.TrimSpace(c.SSLMode)
	if sslMode == "" {
		sslMode = "require"
	}
	q := url.Values{}
	q.Set("sslmode", sslMode)
	q.Set("application_name", "saturn")
	u := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(c.User, c.Password),
		Host:     fmt.Sprintf("%s:%d", c.Host, c.Port),
		Path:     "/" + c.Name,
		RawQuery: q.Encode(),
	}
	return u.String()
}

// GRPCConfig holds gRPC server settings.
type GRPCConfig struct {
	Socket string `mapstructure:"socket"`
}

// GatewayConfig holds the HTTP gateway server settings.
type GatewayConfig struct {
	Addr           string   `mapstructure:"addr"`
	RoutePrefix    string   `mapstructure:"route_prefix"`
	CookieSecure   bool     `mapstructure:"cookie_secure"`
	TrustedProxies []string `mapstructure:"trusted_proxies"`
}

// ShutdownConfig holds shutdown behavior settings.
type ShutdownConfig struct {
	Timeout time.Duration `mapstructure:"timeout"`
}

// LogConfig holds logging settings.
type LogConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
}

// RateLimitConfig holds token-bucket rate limiting settings for public auth RPCs.
type RateLimitConfig struct {
	Enabled           bool    `mapstructure:"enabled"`
	RequestsPerMinute float64 `mapstructure:"requests_per_minute"`
	Burst             int     `mapstructure:"burst"`
}

// AuthConfig holds JWT and authentication settings.
type AuthConfig struct {
	Issuer         string            `mapstructure:"issuer"`
	Audience       string            `mapstructure:"audience"`
	AccessTTL      time.Duration     `mapstructure:"access_ttl"`
	ClockSkew      time.Duration     `mapstructure:"clock_skew"`
	ActiveKeyID    string            `mapstructure:"active_key_id"`
	PrivateKeyPath string            `mapstructure:"private_key_path"`
	PublicKeys     map[string]string `mapstructure:"public_keys"`
	RateLimit      RateLimitConfig   `mapstructure:"rate_limit"`
}

// NewViper creates and configures a Viper instance with config file search
// paths, env var prefixes, and sensible defaults.
func NewViper() *viper.Viper {
	v := viper.New()
	v.SetConfigName(defaultConfigName)
	v.SetConfigType("yaml")
	v.AddConfigPath(defaultConfigDir)
	v.AddConfigPath(defaultConfigHomeDir)
	v.SetEnvPrefix(defaultEnvPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	v.SetDefault("db.host", defaultDBHost)
	v.SetDefault("db.port", defaultDBPort)
	v.SetDefault("db.user", defaultDBUser)
	v.SetDefault("db.password", defaultDBPassword)
	v.SetDefault("db.name", defaultDBName)
	v.SetDefault("db.ssl_mode", "require")
	v.SetDefault("db.max_open_conns", 25)
	v.SetDefault("db.max_idle_conns", 10)
	v.SetDefault("db.conn_max_lifetime", 15*time.Minute)
	v.SetDefault("db.conn_max_idle_time", 5*time.Minute)

	v.SetDefault("grpc.socket", defaultGRPCSocket)
	v.SetDefault("gateway.addr", defaultGatewayAddr)
	v.SetDefault("gateway.route_prefix", defaultRoutePrefix)
	v.SetDefault("gateway.cookie_secure", true)
	v.SetDefault("gateway.trusted_proxies", []string{})
	v.SetDefault("shutdown.timeout", defaultShutdownTime)
	v.SetDefault("log.level", defaultLogLevel)
	v.SetDefault("log.format", "text")
	v.SetDefault("swagger.enabled", false)
	v.SetDefault("swagger.path", defaultSwaggerPath)

	v.SetDefault("auth.issuer", defaultJWTIssuer)
	v.SetDefault("auth.audience", defaultJWTAudience)
	v.SetDefault("auth.access_ttl", defaultJWTAccessTTL)
	v.SetDefault("auth.clock_skew", defaultJWTClockSkew)
	v.SetDefault("auth.active_key_id", defaultJWTActiveKeyID)
	v.SetDefault("auth.private_key_path", defaultJWTKeyDir+"/private.pem")
	v.SetDefault("auth.public_keys", map[string]string{})
	v.SetDefault("auth.rate_limit.enabled", true)
	v.SetDefault("auth.rate_limit.requests_per_minute", 30.0)
	v.SetDefault("auth.rate_limit.burst", 20)

	v.SetDefault("backup.driver", "local")
	v.SetDefault("backup.local_dir", "./backups")
	v.SetDefault("backup.s3_bucket", "")
	v.SetDefault("backup.s3_region", "us-east-1")
	v.SetDefault("backup.s3_endpoint", "")

	v.SetDefault("security.encryption_key", "")

	v.SetDefault("connector.public_callback_base_url", "http://localhost:8080/v1/platform/connectors/oauth")
	v.SetDefault("connector.google.client_id", "")
	v.SetDefault("connector.google.client_secret", "")
	v.SetDefault("connector.microsoft.client_id", "")
	v.SetDefault("connector.microsoft.client_secret", "")
	v.SetDefault("connector.microsoft.tenant_id", "common")

	return v
}

// LoadConfig reads configuration from file, env vars, and flags, then
// unmarshals it into a Config struct.
func LoadConfig(v *viper.Viper) *Config {
	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			log.Warn(context.Background(), "failed to read config file", log.Err(err))
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		log.Error(context.Background(), "failed to parse config", log.Err(err))
		os.Exit(1)
	}

	return &cfg
}

// BindFlags binds all pflags to Viper so that flag values override
// env var and file defaults.
func BindFlags(v *viper.Viper, flags *pflag.FlagSet) {
	flags.VisitAll(func(f *pflag.Flag) {
		_ = v.BindPFlag(f.Name, f)
	})
}

// ToTokenConfig converts the AuthConfig into a token.Config suitable
// for passing to token.NewEd25519Service.
func (c *AuthConfig) ToTokenConfig() (issuer, audience string, accessTTL, clockSkew time.Duration, activeKeyID string) {
	return c.Issuer, c.Audience, c.AccessTTL, c.ClockSkew, c.ActiveKeyID
}

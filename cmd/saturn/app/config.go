package app

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

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

var logLevels = map[string]slog.Level{
	"debug": slog.LevelDebug,
	"info":  slog.LevelInfo,
	"warn":  slog.LevelWarn,
	"error": slog.LevelError,
}

// Config holds all application configuration, organized by subsystem.
type Config struct {
	DB       DBConfig
	GRPC     GRPCConfig
	Gateway  GatewayConfig
	Shutdown ShutdownConfig
	Log      LogConfig
	Swagger  SwaggerConfig
	Auth     AuthConfig
	Backup   BackupConfig
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
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	Name     string `mapstructure:"name"`
}

// DSN returns the PostgreSQL data source name for connecting to the database.
func (c DBConfig) DSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable", c.User, c.Password, c.Host, c.Port, c.Name)
}

// GRPCConfig holds gRPC server settings.
type GRPCConfig struct {
	Socket string `mapstructure:"socket"`
}

// GatewayConfig holds the HTTP gateway server settings.
type GatewayConfig struct {
	Addr        string `mapstructure:"addr"`
	RoutePrefix string `mapstructure:"route_prefix"`
}

// ShutdownConfig holds shutdown behavior settings.
type ShutdownConfig struct {
	Timeout time.Duration `mapstructure:"timeout"`
}

// LogConfig holds logging settings.
type LogConfig struct {
	Level string `mapstructure:"level"`
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

	v.SetDefault("grpc.socket", defaultGRPCSocket)
	v.SetDefault("gateway.addr", defaultGatewayAddr)
	v.SetDefault("gateway.route_prefix", defaultRoutePrefix)
	v.SetDefault("shutdown.timeout", defaultShutdownTime)
	v.SetDefault("log.level", defaultLogLevel)
	v.SetDefault("swagger.enabled", false)
	v.SetDefault("swagger.path", defaultSwaggerPath)

	v.SetDefault("auth.issuer", defaultJWTIssuer)
	v.SetDefault("auth.audience", defaultJWTAudience)
	v.SetDefault("auth.access_ttl", defaultJWTAccessTTL)
	v.SetDefault("auth.clock_skew", defaultJWTClockSkew)
	v.SetDefault("auth.active_key_id", defaultJWTActiveKeyID)
	v.SetDefault("auth.private_key_path", defaultJWTKeyDir+"/private.pem")
	v.SetDefault("auth.public_keys", map[string]string{})

	v.SetDefault("backup.driver", "local")
	v.SetDefault("backup.local_dir", "./backups")
	v.SetDefault("backup.s3_bucket", "")
	v.SetDefault("backup.s3_region", "us-east-1")
	v.SetDefault("backup.s3_endpoint", "")

	return v
}

// LoadConfig reads configuration from file, env vars, and flags, then
// unmarshals it into a Config struct.
func LoadConfig(v *viper.Viper) *Config {
	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			slog.Warn("failed to read config file", "err", err)
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		slog.Error("failed to parse config", "err", err)
		os.Exit(1)
	}

	return &cfg
}

// BindFlags binds all pflags to Viper so that flag values override
// env var and file defaults.
func BindFlags(v *viper.Viper, flags *pflag.FlagSet) {
	flags.VisitAll(func(f *pflag.Flag) {
		v.BindPFlag(f.Name, f)
	})
}

// ToTokenConfig converts the AuthConfig into a token.Config suitable
// for passing to token.NewEd25519Service.
func (c *AuthConfig) ToTokenConfig() (issuer, audience string, accessTTL, clockSkew time.Duration, activeKeyID string) {
	return c.Issuer, c.Audience, c.AccessTTL, c.ClockSkew, c.ActiveKeyID
}

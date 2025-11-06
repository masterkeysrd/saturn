package env

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// GetString retrieves an environment variable as a string.
// Returns an empty string if not found.
func GetString(key string) string {
	return strings.TrimSpace(os.Getenv(key))
}

// GetStringDefault retrieves an env var or returns the provided default value.
func GetStringDefault(key, def string) string {
	val := GetString(key)
	if val == "" {
		return def
	}
	return val
}

// GetInt retrieves an env var and parses it into an int.
// Returns an error if parsing fails.
func GetInt(key string) (int, error) {
	val := GetString(key)
	if val == "" {
		return 0, fmt.Errorf("environment variable %q not set", key)
	}

	i, err := strconv.Atoi(val)
	if err != nil {
		return 0, fmt.Errorf("cannot parse %q into integer for key %q: %w", val, key, err)
	}

	return i, nil
}

// GetIntDefault retrieves an env var as int, or returns the default if not set or invalid.
func GetIntDefault(key string, def int) int {
	val := GetString(key)
	if val == "" {
		return def
	}

	i, err := strconv.Atoi(val)
	if err != nil {
		return def
	}
	return i
}

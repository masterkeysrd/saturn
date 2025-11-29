package encoding

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// GetStringQuery extracts a string from query parameters
func GetStringQuery(r *http.Request, key string, defaultValue string) string {
	value := r.URL.Query().Get(key)
	if value == "" {
		return defaultValue
	}
	return value
}

// GetIntQuery extracts an integer from query parameters
func GetIntQuery(r *http.Request, key string, defaultValue int) (int, error) {
	value := r.URL.Query().Get(key)
	if value == "" {
		return defaultValue, nil
	}

	result, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("must be a valid integer")
	}

	return result, nil
}

// GetStringSliceQuery extracts a comma-separated list from query parameters
func GetStringSliceQuery(r *http.Request, key string) []string {
	value := r.URL.Query().Get(key)
	if value == "" {
		return nil
	}

	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}

	return result
}

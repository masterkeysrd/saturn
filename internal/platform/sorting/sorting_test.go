package sorting

import "testing"

func TestParse(t *testing.T) {
	tests := []struct {
		input     string
		expectedF string
		expectedA bool
	}{
		{input: "", expectedF: "", expectedA: true},
		{input: "effective_date", expectedF: "effective_date", expectedA: true},
		{input: "effective_date:desc", expectedF: "effective_date", expectedA: false},
		{input: "effective_date:DESC", expectedF: "effective_date", expectedA: false},
		{input: "amount:asc", expectedF: "amount", expectedA: true},
		{input: "amount:ASC", expectedF: "amount", expectedA: true},
		{input: "vendor:random", expectedF: "vendor", expectedA: true}, // defaults to asc if invalid
	}

	for _, tc := range tests {
		result := Parse(tc.input)
		if result.Field != tc.expectedF {
			t.Errorf("Parse(%q): expected field %q, got %q", tc.input, tc.expectedF, result.Field)
		}
		if result.Ascending != tc.expectedA {
			t.Errorf("Parse(%q): expected ascending %t, got %t", tc.input, tc.expectedA, result.Ascending)
		}
	}
}

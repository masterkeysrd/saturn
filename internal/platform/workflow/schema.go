package workflow

import (
	"bytes"
	"encoding/json/jsontext"
	"encoding/json/v2"
	"fmt"
	"io"
	"reflect"
	"strconv"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"
)

// SchemaFor derives a JSON Schema map from Go type T using github.com/google/jsonschema-go/jsonschema.
// Returns nil for interface/any types where no static schema constraint exists.
func SchemaFor[T any]() map[string]any {
	rt := reflect.TypeFor[T]()
	if rt.Kind() == reflect.Interface {
		return nil
	}
	if rt.Kind() == reflect.Map && rt.Key().Kind() == reflect.String && rt.Elem().Kind() == reflect.Interface {
		return map[string]any{"type": "object"}
	}

	schema, err := jsonschema.For[T](&jsonschema.ForOptions{
		IgnoreInvalidTypes: true,
	})
	if err != nil || schema == nil {
		return nil
	}

	raw, err := json.Marshal(schema)
	if err != nil {
		return nil
	}
	val, err := decodeJSONPreserveInts(raw)
	if err != nil {
		return nil
	}
	m, ok := val.(map[string]any)
	if !ok {
		return nil
	}
	return m
}

func decodeTypedInputs[T any](raw map[string]any) (T, error) {
	var zero T
	if raw == nil {
		return zero, nil
	}
	rt := reflect.TypeFor[T]()
	if rt.Kind() == reflect.Map && rt.Key().Kind() == reflect.String && rt.Elem().Kind() == reflect.Interface {
		if out, ok := any(raw).(T); ok {
			return out, nil
		}
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return zero, fmt.Errorf("encode inputs: %w", err)
	}
	var out T
	if err := json.Unmarshal(data, &out); err != nil {
		return zero, fmt.Errorf("decode inputs into %T: %w", out, err)
	}
	return out, nil
}

func normalizeOutputForCEL(val any) (any, error) {
	if val == nil {
		return nil, nil
	}
	rv := reflect.ValueOf(val)
	if rv.Kind() == reflect.Pointer && rv.IsNil() {
		return nil, nil
	}
	if rv.Kind() == reflect.Slice && rv.IsNil() {
		return []any{}, nil
	}
	data, err := json.Marshal(val)
	if err != nil {
		return nil, fmt.Errorf("encode output %T: %w", val, err)
	}
	return decodeJSONPreserveInts(data)
}

func normalizeMapOutputForCEL(val any) (map[string]any, error) {
	norm, err := normalizeOutputForCEL(val)
	if err != nil {
		return nil, err
	}
	if norm == nil {
		return map[string]any{}, nil
	}
	m, ok := norm.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("step output %T must serialize to a JSON object, got %T", val, norm)
	}
	return m, nil
}

func decodeJSONPreserveInts(data []byte) (any, error) {
	dec := jsontext.NewDecoder(bytes.NewReader(data))
	val, err := readJSONValue(dec)
	if err != nil {
		return nil, err
	}
	return val, nil
}

func readJSONValue(dec *jsontext.Decoder) (any, error) {
	tok, err := dec.ReadToken()
	if err != nil {
		if err == io.EOF {
			return nil, nil
		}
		return nil, err
	}
	switch tok.Kind() {
	case 'n':
		return nil, nil
	case 't':
		return true, nil
	case 'f':
		return false, nil
	case '"':
		return tok.String(), nil
	case '0':
		raw := tok.String()
		if !strings.ContainsAny(raw, ".eE") {
			if i, err := strconv.ParseInt(raw, 10, 64); err == nil {
				return i, nil
			}
		}
		f, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return nil, err
		}
		return f, nil
	case '{':
		obj := make(map[string]any)
		for dec.PeekKind() != '}' {
			keyTok, err := dec.ReadToken()
			if err != nil {
				return nil, err
			}
			key := keyTok.String()
			val, err := readJSONValue(dec)
			if err != nil {
				return nil, err
			}
			obj[key] = val
		}
		if _, err := dec.ReadToken(); err != nil {
			return nil, err
		}
		return obj, nil
	case '[':
		arr := make([]any, 0)
		for dec.PeekKind() != ']' {
			val, err := readJSONValue(dec)
			if err != nil {
				return nil, err
			}
			arr = append(arr, val)
		}
		if _, err := dec.ReadToken(); err != nil {
			return nil, err
		}
		return arr, nil
	default:
		return nil, fmt.Errorf("unexpected JSON token kind %q", tok.Kind())
	}
}

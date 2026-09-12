package codegen

import (
	"fmt"
	"strings"
)

// Param represents an input parameter of an interface method.
type Param struct {
	Name       string
	Type       string
	IsVariadic bool
}

// ExportedName returns the parameter name capitalized for use in exported struct fields.
func (p Param) ExportedName() string {
	if p.Name == "" {
		return ""
	}
	return strings.ToUpper(p.Name[:1]) + p.Name[1:]
}

// Result represents an output result of an interface method.
type Result struct {
	Name      string
	Type      string
	ZeroValue string
}

// MethodInfo represents an individual method of an interface.
type MethodInfo struct {
	Name    string
	Doc     string
	Params  []Param
	Results []Result
}

// HasAnnotation returns true if the method doc contains the given tag (e.g. "@transactional").
func (m *MethodInfo) HasAnnotation(tag string) bool {
	tag = strings.TrimPrefix(tag, "//")
	tag = strings.TrimSpace(tag)
	return strings.Contains(strings.ToLower(m.Doc), strings.ToLower(tag))
}

// ParamsSignature returns the comma-separated parameter declaration string (e.g. "ctx context.Context, id string").
func (m *MethodInfo) ParamsSignature() string {
	var decls []string
	for _, p := range m.Params {
		decls = append(decls, fmt.Sprintf("%s %s", p.Name, p.Type))
	}
	return strings.Join(decls, ", ")
}

// CallArgs returns the comma-separated arguments for calling the method (e.g. "ctx, id, opts...").
func (m *MethodInfo) CallArgs() string {
	var args []string
	for _, p := range m.Params {
		if p.IsVariadic || strings.HasPrefix(p.Type, "...") {
			args = append(args, p.Name+"...")
		} else {
			args = append(args, p.Name)
		}
	}
	return strings.Join(args, ", ")
}

// ResultsSignature returns the return types declaration (e.g. "(*agent.Agent, error)").
func (m *MethodInfo) ResultsSignature() string {
	var types []string
	for _, r := range m.Results {
		types = append(types, r.Type)
	}
	if len(types) == 0 {
		return ""
	}
	if len(types) == 1 {
		return types[0]
	}
	return "(" + strings.Join(types, ", ") + ")"
}

// HasContextParam returns true if the first parameter is a context.Context.
func (m *MethodInfo) HasContextParam() bool {
	if len(m.Params) == 0 {
		return false
	}
	return strings.Contains(m.Params[0].Type, "context.Context")
}

// HasErrorResult returns true if the last return type is error.
func (m *MethodInfo) HasErrorResult() bool {
	if len(m.Results) == 0 {
		return false
	}
	return m.Results[len(m.Results)-1].Type == "error"
}

// ZeroReturns returns a slice of zero values for all results except the trailing error (if any).
func (m *MethodInfo) ZeroReturns() []string {
	var zeros []string
	limit := len(m.Results)
	if m.HasErrorResult() {
		limit--
	}
	for i := 0; i < limit; i++ {
		zeros = append(zeros, ZeroValueOf(m.Results[i].Type))
	}
	return zeros
}

// InterfaceInfo represents metadata about an interface extracted by the AST parser.
type InterfaceInfo struct {
	PkgName string
	Dir     string
	Name    string
	Doc     string
	Methods []MethodInfo
	Imports map[string]string // aliasOrPkgName -> fullImportPath
}

// HasAnnotation returns true if the interface doc comment contains the given tag (e.g. "@Mock").
func (i *InterfaceInfo) HasAnnotation(tag string) bool {
	tag = strings.TrimPrefix(tag, "//")
	tag = strings.TrimSpace(tag)
	return strings.Contains(strings.ToLower(i.Doc), strings.ToLower(tag))
}

// MockName returns the conventional mock struct name for this interface (e.g. "AgentStoreMock").
func (i *InterfaceInfo) MockName() string {
	return i.Name + "Mock"
}

// ZeroValueOf returns the default zero value representation for a Go type string.
func ZeroValueOf(typeStr string) string {
	typeStr = strings.TrimSpace(typeStr)
	switch {
	case strings.HasPrefix(typeStr, "*") ||
		strings.HasPrefix(typeStr, "[]") ||
		strings.HasPrefix(typeStr, "map[") ||
		strings.HasPrefix(typeStr, "chan ") ||
		strings.HasPrefix(typeStr, "<-chan ") ||
		strings.HasPrefix(typeStr, "func(") ||
		typeStr == "any" || typeStr == "interface{}":
		return "nil"
	case typeStr == "string":
		return `""`
	case typeStr == "bool":
		return "false"
	case typeStr == "int" || typeStr == "int8" || typeStr == "int16" || typeStr == "int32" || typeStr == "int64" ||
		typeStr == "uint" || typeStr == "uint8" || typeStr == "uint16" || typeStr == "uint32" || typeStr == "uint64" ||
		typeStr == "uintptr" || typeStr == "byte" || typeStr == "rune" ||
		typeStr == "float32" || typeStr == "float64":
		return "0"
	case typeStr == "error":
		return "nil"
	default:
		return typeStr + "{}"
	}
}

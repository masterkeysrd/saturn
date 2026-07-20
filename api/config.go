package api

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"regexp"
	"strings"

	"go.yaml.in/yaml/v3"
)

//go:embed api.yaml
//go:embed saturn/identity/v1/identity.yaml
//go:embed saturn/identity/admin/v1/identityadmin.yaml
//go:embed saturn/space/v1/space.yaml
//go:embed saturn/finance/v1/finance.yaml
var configFS embed.FS

// ServiceConfig represents a parsed API configuration YAML file.
type ServiceConfig struct {
	Name          string   `yaml:"name"`
	Title         string   `yaml:"title"`
	APIs          []string `yaml:"apis"`
	Documentation struct {
		Summary string `yaml:"summary"`
	} `yaml:"documentation"`
	SecurityDefinitions map[string]map[string]any `yaml:"securityDefinitions"`
	Authentication      struct {
		Rules []AuthRule `yaml:"rules"`
	} `yaml:"authentication"`
	Space struct {
		Rules []SpaceRule `yaml:"rules"`
	} `yaml:"space"`
}

// AuthRule defines the authentication and authorization policy for gRPC methods matching the selector.
type AuthRule struct {
	Selector     string   `yaml:"selector"`
	AuthRequired bool     `yaml:"auth_required"`
	AccessLevels []string `yaml:"access_levels,omitempty"`
}

// SpaceRule defines the space-scoping policy for gRPC methods matching the selector.
type SpaceRule struct {
	Selector string `yaml:"selector"`
	Scoped   bool   `yaml:"scoped"`
}

// LoadServiceConfigs reads all config YAML files from the embed.FS.
// Returns the global config and per-module configs.
func LoadServiceConfigs() (global *ServiceConfig, modules []*ServiceConfig, err error) {
	global = &ServiceConfig{}

	globalData, err := configFS.ReadFile("api.yaml")
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read api.yaml: %w", err)
	}
	if err := yaml.Unmarshal(globalData, global); err != nil {
		return nil, nil, fmt.Errorf("failed to parse api.yaml: %w", err)
	}

	modules = make([]*ServiceConfig, 0)
	err = fs.WalkDir(configFS, "saturn", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".yaml") {
			return nil
		}

		data, err := configFS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", path, err)
		}

		var config ServiceConfig
		if err := yaml.Unmarshal(data, &config); err != nil {
			return fmt.Errorf("failed to parse %s: %w", path, err)
		}
		modules = append(modules, &config)
		return nil
	})
	if err != nil {
		return nil, nil, err
	}

	return global, modules, nil
}

// CompileAllRules merges global and module auth rules into a single list.
// Rules are evaluated in order: global first, then modules.
// The last matching rule wins.
func CompileAllRules(global *ServiceConfig, modules []*ServiceConfig) []AuthRule {
	var allRules []AuthRule
	if global != nil {
		allRules = append(allRules, global.Authentication.Rules...)
	}
	for _, m := range modules {
		allRules = append(allRules, m.Authentication.Rules...)
	}
	return allRules
}

// CompileAllSpaceRules merges global and module space rules into a single list.
// Rules are evaluated in order: global first, then modules.
// The last matching rule wins.
func CompileAllSpaceRules(global *ServiceConfig, modules []*ServiceConfig) []SpaceRule {
	var allRules []SpaceRule
	if global != nil {
		allRules = append(allRules, global.Space.Rules...)
	}
	for _, m := range modules {
		allRules = append(allRules, m.Space.Rules...)
	}
	return allRules
}

// buildTagPrefixMap constructs a mapping from swagger tag name to its FQN package prefix.
// For example, tag "Identity" → prefix "saturn.identity.v1" (derived from "saturn.identity.v1.Identity").
func buildTagPrefixMap(modules []*ServiceConfig) map[string]string {
	tagMap := make(map[string]string)
	for _, m := range modules {
		for _, svcFQN := range m.APIs {
			// Extract tag name: last component after the final dot.
			// e.g. "saturn.identity.v1.Identity" → tag "Identity"
			lastDot := strings.LastIndex(svcFQN, ".")
			if lastDot < 0 {
				continue
			}
			tag := svcFQN[lastDot+1:]
			prefix := svcFQN[:lastDot]
			tagMap[tag] = prefix
		}
	}
	return tagMap
}

// toFQN converts a swagger operationId (e.g. "Identity_LoginUser") to FQN format
// (e.g. "saturn.identity.v1.Identity.LoginUser") using the tag→prefix map.
func toFQN(tag, operationID string, tagPrefixMap map[string]string) string {
	prefix, ok := tagPrefixMap[tag]
	if !ok {
		return ""
	}
	// Split operationId by underscore: "Identity_LoginUser" → method "LoginUser"
	underscore := strings.Index(operationID, "_")
	if underscore < 0 {
		return prefix + "." + tag + "." + operationID
	}
	method := operationID[underscore+1:]
	return prefix + "." + tag + "." + method
}

// ApplyConfig merges all service configs and applies them to the generated JSON spec.
// Rules are matched against the fully-qualified operationId (e.g. "saturn.identity.v1.Identity.LoginUser").
func ApplyConfig(specJSON []byte) ([]byte, error) {
	var document map[string]json.RawMessage
	if err := json.Unmarshal(specJSON, &document); err != nil {
		return nil, fmt.Errorf("failed to parse spec JSON: %w", err)
	}

	global, modules, err := LoadServiceConfigs()
	if err != nil {
		return nil, fmt.Errorf("failed to load service configs: %w", err)
	}

	rules := CompileAllRules(global, modules)
	spaceRules := CompileAllSpaceRules(global, modules)

	// Build tag→prefix map for FQN normalization
	tagPrefixMap := buildTagPrefixMap(modules)

	// Apply info
	if global != nil {
		infoObj := map[string]string{
			"title":   global.Title,
			"version": "1.0.0",
		}
		if global.Documentation.Summary != "" {
			infoObj["description"] = global.Documentation.Summary
		}
		infoJSON, _ := json.Marshal(infoObj)
		document["info"] = infoJSON
	}

	// Apply securityDefinitions
	if len(global.SecurityDefinitions) > 0 {
		sdJSON, _ := json.Marshal(global.SecurityDefinitions)
		document["securityDefinitions"] = sdJSON
	}

	// Apply tags descriptions
	var tags []map[string]any
	if tagsRaw, ok := document["tags"]; ok {
		if err := json.Unmarshal(tagsRaw, &tags); err == nil {
			for _, tagMap := range tags {
				nameVal, ok := tagMap["name"]
				if !ok {
					continue
				}
				name, ok := nameVal.(string)
				if !ok {
					continue
				}

				// Find matching prefix in modules
				prefix, ok := tagPrefixMap[name]
				if !ok {
					continue
				}

				// Find the module config
				for _, m := range modules {
					if m.Name == prefix {
						if m.Documentation.Summary != "" {
							tagMap["description"] = m.Documentation.Summary
						} else if m.Title != "" {
							tagMap["description"] = m.Title
						}
					}
				}
			}
			tagsJSON, _ := json.Marshal(tags)
			document["tags"] = tagsJSON
		}
	}

	// Apply auth rules to each operation
	var paths map[string]json.RawMessage
	if pathsRaw, ok := document["paths"]; ok {
		if err := json.Unmarshal(pathsRaw, &paths); err != nil {
			return nil, fmt.Errorf("failed to parse paths: %w", err)
		}
	}

	for path, opRaw := range paths {
		var pathOps map[string]json.RawMessage
		if err := json.Unmarshal(opRaw, &pathOps); err != nil {
			continue
		}

		for method, opRaw := range pathOps {
			var op map[string]json.RawMessage
			if err := json.Unmarshal(opRaw, &op); err != nil {
				continue
			}

			// Extract the operationId from the operation
			var operationID string
			if opIDRaw, ok := op["operationId"]; ok {
				json.Unmarshal(opIDRaw, &operationID)
			}

			// Extract the tag(s) from the operation to determine the service
			var tags []string
			if tagsRaw, ok := op["tags"]; ok {
				json.Unmarshal(tagsRaw, &tags)
			}
			tag := ""
			if len(tags) > 0 {
				tag = tags[0]
			}

			// Normalize operationId to FQN format
			fqn := toFQN(tag, operationID, tagPrefixMap)

			// Find the last matching rule for this operation
			var applySecurity bool
			var accessLevels []string
			for _, rule := range rules {
				if matchMethodSelector(rule.Selector, fqn) {
					applySecurity = rule.AuthRequired
					accessLevels = rule.AccessLevels
				}
			}

			// Find the last matching space rule for this operation
			spaceScoped := true // secure-by-default fallback
			for _, rule := range spaceRules {
				if matchMethodSelector(rule.Selector, fqn) {
					spaceScoped = rule.Scoped
				}
			}

			if applySecurity {
				if spaceScoped {
					op["security"] = json.RawMessage(`[{"bearerAuth":[],"spaceIdAuth":[]}]`)
				} else {
					op["security"] = json.RawMessage(`[{"bearerAuth":[]}]`)
				}
			} else {
				delete(op, "security")
			}

			// Inject x-access-levels vendor extension for endpoints with access level restrictions
			if len(accessLevels) > 0 {
				alJSON, _ := json.Marshal(accessLevels)
				op["x-access-levels"] = alJSON
			}

			updatedOp, _ := json.Marshal(op)
			pathOps[method] = updatedOp
		}

		updatedPath, _ := json.Marshal(pathOps)
		paths[path] = updatedPath
	}

	pathsJSON, _ := json.Marshal(paths)
	document["paths"] = pathsJSON

	return json.Marshal(document)
}

// matchMethodSelector matches a fully-qualified method name against a YAML selector pattern.
// Supports wildcards: "*" matches anything, ".*" matches suffix.
func matchMethodSelector(selector, method string) bool {
	// Convert selector to regex: "*" → ".*"
	pattern := "^" + regexp.QuoteMeta(selector) + "$"
	pattern = strings.ReplaceAll(pattern, `\*`, `.*`)
	matched, _ := regexp.MatchString(pattern, method)
	return matched
}

// Deprecated: Use LoadServiceConfigs instead.
func LoadOverlays() (*ServiceConfig, []*ServiceConfig, error) {
	return LoadServiceConfigs()
}

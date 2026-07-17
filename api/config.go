package api

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"strings"

	"go.yaml.in/yaml/v3"
)

//go:embed api.yaml
//go:embed saturn/identity/v1/identity.yaml
//go:embed saturn/identity/admin/v1/identityadmin.yaml
var configFS embed.FS

// Overlay represents a parsed config YAML file.
type Overlay struct {
	Info struct {
		Title string `yaml:"title"`
	} `yaml:"info"`

	SecurityDefinitions map[string]map[string]interface{} `yaml:"securityDefinitions"`

	Authentication struct {
		Rules []AuthRule `yaml:"rules"`
	} `yaml:"authentication"`
}

// AuthRule represents a single authentication rule.
type AuthRule struct {
	Selector string                `yaml:"selector"`
	Allow    bool                  `yaml:"allow"`
	Security []SecurityRequirement `yaml:"security"`
}

// SecurityRequirement represents a security requirement entry.
type SecurityRequirement struct {
	Scopes []string `yaml:"scopes"`
}

// LoadOverlays reads all config YAML files from the embed.FS.
// Returns the global overlay (api.yaml) and per-module overlays.
func LoadOverlays() (global *Overlay, modules []*Overlay, err error) {
	global = &Overlay{}

	globalData, err := configFS.ReadFile("api.yaml")
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read api.yaml: %w", err)
	}
	if err := yaml.Unmarshal(globalData, global); err != nil {
		return nil, nil, fmt.Errorf("failed to parse api.yaml: %w", err)
	}

	modules = make([]*Overlay, 0)
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

		var overlay Overlay
		if err := yaml.Unmarshal(data, &overlay); err != nil {
			return fmt.Errorf("failed to parse %s: %w", path, err)
		}
		modules = append(modules, &overlay)
		return nil
	})
	if err != nil {
		return nil, nil, err
	}

	return global, modules, nil
}

// ApplyConfig merges all overlays and applies them to the generated JSON spec.
func ApplyConfig(specJSON []byte) ([]byte, error) {
	var document map[string]json.RawMessage
	if err := json.Unmarshal(specJSON, &document); err != nil {
		return nil, fmt.Errorf("failed to parse spec JSON: %w", err)
	}

	overlay, _, err := LoadOverlays()
	if err != nil {
		return nil, fmt.Errorf("failed to load overlays: %w", err)
	}

	// Apply info
	if overlay.Info.Title != "" {
		document["info"] = json.RawMessage(fmt.Sprintf(`{"title":"%s","version":"1.0.0"}`, overlay.Info.Title))
	}

	// Apply securityDefinitions
	if len(overlay.SecurityDefinitions) > 0 {
		sdJSON, _ := json.Marshal(overlay.SecurityDefinitions)
		document["securityDefinitions"] = sdJSON
	}

	// Apply rules to paths
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

			normalizedPath := strings.TrimPrefix(path, "/")

			if matchesPublicPath(normalizedPath) {
				delete(op, "security")
			} else {
				op["security"] = json.RawMessage(`[{"bearerAuth":[]}]`)
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

// matchesPublicPath checks if a path is a public (no-auth) endpoint.
func matchesPublicPath(path string) bool {
	publicPaths := []string{
		"v1/identity/login",
		"v1/identity/users",
	}
	for _, p := range publicPaths {
		if path == p {
			return true
		}
	}
	return false
}

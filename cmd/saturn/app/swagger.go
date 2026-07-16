package app

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/masterkeysrd/saturn/api"
	"github.com/swaggest/swgui/v5emb"
)

func apiV1Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r2 := r.Clone(r.Context())
		r2.URL.Path = strings.TrimPrefix(r.URL.Path, "/api")
		next.ServeHTTP(w, r2)
	})
}

// SwaggerHandler creates an http.Handler that serves both the embedded swagger JSON
// spec and the swgui/v5emb interactive UI at the given swagger base path.
//
// swaggerJSONPath is the URL path where the swagger JSON spec will be served
// (e.g. "/swagger/api.swagger.json"). The UI is mounted at the base path
// derived from swaggerJSONPath (e.g. "/swagger/").
func SwaggerHandler(swaggerJSONPath string) http.Handler {
	basePath := swaggerJSONPath[:len(swaggerJSONPath)-len("api.swagger.json")]

	jsonHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == swaggerJSONPath {
			data, err := api.SwaggerFS.ReadFile("api.swagger.json")
			if err != nil {
				http.Error(w, "swagger JSON not found", http.StatusInternalServerError)
				return
			}

			data, err = apiSwaggerJSON(data)
			if err != nil {
				http.Error(w, "swagger JSON is invalid", http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			w.Write(data)
			return
		}
		http.NotFound(w, r)
	})

	uiHandler := v5emb.New("Saturn API", swaggerJSONPath, basePath)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == swaggerJSONPath {
			jsonHandler.ServeHTTP(w, r)
			return
		}
		uiHandler.ServeHTTP(w, r)
	})
}

func apiSwaggerJSON(data []byte) ([]byte, error) {
	var document map[string]json.RawMessage
	if err := json.Unmarshal(data, &document); err != nil {
		return nil, err
	}

	var paths map[string]json.RawMessage
	if err := json.Unmarshal(document["paths"], &paths); err != nil {
		return nil, err
	}

	document["basePath"] = json.RawMessage(`"/api"`)
	apiPaths := make(map[string]json.RawMessage, len(paths))
	for path, operation := range paths {
		apiPaths[strings.TrimPrefix(path, "/api")] = operation
	}
	pathsJSON, err := json.Marshal(apiPaths)
	if err != nil {
		return nil, err
	}
	document["paths"] = pathsJSON

	return json.Marshal(document)
}

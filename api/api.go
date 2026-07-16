package api

import "embed"

//go:embed api.swagger.json
var SwaggerFS embed.FS

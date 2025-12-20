package typescriptgen

import (
	"fmt"
	"path"
	"strings"

	"google.golang.org/genproto/googleapis/api/annotations"
	"google.golang.org/protobuf/compiler/protogen"
	"google.golang.org/protobuf/proto"
)

// GenerateAxiosOptions holds configuration for the Axios client generation.
type GenerateAxiosOptions struct {
	AxiosImportPath string
	URLPrefix       string
}

// GenerateAxios generates TypeScript Axios client code for the given proto file.
func GenerateAxios(gen *protogen.Plugin, file *protogen.File, options GenerateAxiosOptions) {
	if len(file.Services) == 0 {
		return
	}

	filename := file.GeneratedFilenamePrefix + ".client.ts"
	g := gen.NewGeneratedFile(filename, file.GoImportPath)

	typesFilename := path.Base(file.GeneratedFilenamePrefix) + "_pb"

	// Import statements
	g.P("import { getAxios } from '", options.AxiosImportPath, "';")
	g.P("import * as Types from './", typesFilename, "';")
	g.P("import { create, fromJson, type MessageInitShape, toJson } from '@bufbuild/protobuf';")
	g.P("")

	for _, service := range file.Services {
		for _, method := range service.Methods {
			rule, ok := proto.GetExtension(method.Desc.Options(), annotations.E_Http).(*annotations.HttpRule)
			if !ok {
				continue // Skip methods without REST annotations
			}

			// Determine Verb/Path
			var verb, pathStr string
			switch p := rule.Pattern.(type) {
			case *annotations.HttpRule_Get:
				verb, pathStr = "get", p.Get
			case *annotations.HttpRule_Post:
				verb, pathStr = "post", p.Post
			case *annotations.HttpRule_Put:
				verb, pathStr = "put", p.Put
			case *annotations.HttpRule_Delete:
				verb, pathStr = "delete", p.Delete
			case *annotations.HttpRule_Patch:
				verb, pathStr = "patch", p.Patch
			default:
				continue // Unsupported HTTP method
			}

			reqType := "Types." + method.Input.GoIdent.GoName
			reqSchema := reqType + "Schema"
			resType := "Types." + method.Output.GoIdent.GoName
			resSchema := resType + "Schema"

			hasInput := !IsProtoEmpty(method.Input.Desc)
			hasOutput := !IsProtoEmpty(method.Output.Desc)

			if !hasInput {
				reqType = "" // No request body
			}
			if !hasOutput {
				resType = "void"
			}

			inputArg := "req: " + fmt.Sprintf("MessageInitShape<typeof %s>", reqSchema)
			if reqType == "" {
				inputArg = ""
			}

			// --- 1. Analyze Path Parameters ---
			pathParams := make(map[string]bool)
			pathParamFields := make(map[string]string) // proto_name -> jsonName

			// Track which fields are in the path
			for _, field := range method.Input.Fields {
				protoName := string(field.Desc.Name())
				if strings.Contains(pathStr, "{"+protoName+"}") {
					pathParams[protoName] = true
					pathParamFields[protoName] = field.Desc.JSONName()
				}
			}

			// --- 2. Analyze Body ---
			bodyField := rule.Body
			supportsBody := (verb == "post" || verb == "put" || verb == "patch")
			useWholeBodyAsPayload := false
			bodyFieldName := ""

			if supportsBody {
				if bodyField == "*" || (bodyField == "" && hasInput) {
					useWholeBodyAsPayload = true
				} else if bodyField != "" {
					bodyFieldName = bodyField
				}
			}

			// --- 3. Analyze Query Parameters ---
			var queryParams []string

			if hasInput {
				for _, field := range method.Input.Fields {
					protoName := string(field.Desc.Name())
					jsonName := field.Desc.JSONName()

					// Skip if in path
					if pathParams[protoName] {
						continue
					}

					// Skip if it's the body
					if useWholeBodyAsPayload || protoName == bodyFieldName {
						continue
					}

					queryParams = append(queryParams, jsonName)
				}
			}

			// --- 4. Generate Function ---
			funcName := camelCase(method.GoName)

			// Generate JSDoc
			g.P("/**")
			if c := method.Comments.Leading; string(c) != "" {
				for l := range strings.SplitSeq(strings.TrimSuffix(string(c), "\n"), "\n") {
					clean := strings.TrimSpace(l)
					clean = strings.TrimPrefix(clean, "//")
					clean = strings.TrimPrefix(clean, "/*")
					clean = strings.TrimSuffix(clean, "*/")
					clean = strings.TrimPrefix(clean, "*")
					clean = strings.TrimSpace(clean)
					if clean != "" {
						g.P(" * ", strings.TrimSpace(clean))
					} else {
						g.P(" *")
					}
				}
				g.P(" *")
			}
			if reqType != "" {
				g.P(fmt.Sprintf(" * @param req %s", reqType))
			}
			g.P(fmt.Sprintf(" * @returns Promise<%s>", resType))
			g.P(" */")

			g.P(fmt.Sprintf("export async function %s(%s): Promise<%s> {", funcName, inputArg, resType))

			// Create message and convert to JSON
			if hasInput {
				g.P(fmt.Sprintf("  const msg = create(%s, req);", reqSchema))
				g.P(fmt.Sprintf("  const body = toJson(%s, msg);", reqSchema))
				g.P("")
			}

			// Build the path with interpolated values
			finalPath := pathStr
			for protoName, jsonName := range pathParamFields {
				finalPath = strings.ReplaceAll(finalPath, "{"+protoName+"}", `${body.`+jsonName+`}`)
			}

			if options.URLPrefix != "" {
				finalPath = path.Join(options.URLPrefix, finalPath)
			}

			finalPath = "`" + finalPath + "`"

			// Build the axios call
			g.P(fmt.Sprintf("  return getAxios().%s(%s", verb, finalPath))

			// Add body argument for POST/PUT/PATCH
			if supportsBody {
				if useWholeBodyAsPayload {
					g.P("    , body")
				} else if bodyFieldName != "" {
					// Find the JSON name for the body field
					for _, field := range method.Input.Fields {
						if string(field.Desc.Name()) == bodyFieldName {
							g.P(fmt.Sprintf("    , body.%s", field.Desc.JSONName()))
							break
						}
					}
				}
			}

			// Add query params if any
			if len(queryParams) > 0 {
				g.P("    , {")
				g.P("      params: {")
				for _, jsonName := range queryParams {
					g.P(fmt.Sprintf("        %s:  body.%s,", jsonName, jsonName))
				}
				g.P("      }")
				g.P("    }")
			}

			if hasOutput {
				g.P("  ).then((resp) => {")
				g.P(fmt.Sprintf("    return fromJson(%s, resp.data);", resSchema))
			} else {
				g.P("  ).then(() => {")
				g.P("    return;")
			}

			g.P("  });")
			g.P("}")
			g.P("")
		}
	}
}

// camelCase converts "GetSpace" to "getSpace"
func camelCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToLower(s[:1]) + s[1:]
}

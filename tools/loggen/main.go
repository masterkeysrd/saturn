package main

import (
	"bytes"
	"flag"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type methodParam struct {
	Name string
	Type string
}

type methodResult struct {
	Type string
}

type methodInfo struct {
	Name        string
	Doc         string
	SkipLogging bool
	Params      []methodParam
	Results     []methodResult
}

type targetInfo struct {
	PkgName    string
	TargetName string
	Component  string
	Methods    []methodInfo
	Imports    map[string]string // aliasOrPkgName -> fullImportPath
}

func main() {
	target := flag.String("target", "", "Name of the interface to decorate (required)")
	dir := flag.String("dir", ".", "Directory to parse")
	output := flag.String("output", "", "Output file path (defaults to <target>_log.go in dir)")
	pkgFlag := flag.String("pkg", "", "Target package name (defaults to parsed package name)")
	componentFlag := flag.String("component", "", "Component name for logging (defaults to package name)")
	flag.Parse()

	if *target == "" {
		fmt.Fprintln(os.Stderr, "Error: -target flag is required")
		flag.Usage()
		os.Exit(1)
	}

	info, err := parseTarget(*dir, *target)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing target %q in %q: %v\n", *target, *dir, err)
		os.Exit(1)
	}

	if *pkgFlag != "" {
		info.PkgName = *pkgFlag
	}

	if *componentFlag != "" {
		info.Component = *componentFlag
	} else if info.Component == "" {
		info.Component = info.PkgName
	}

	outPath := *output
	if outPath == "" {
		outPath = filepath.Join(*dir, strings.ToLower(*target)+"_log.go")
	}

	generated, err := generateDecorator(info)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error generating decorator: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(outPath, generated, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing output file %q: %v\n", outPath, err)
		os.Exit(1)
	}

	fmt.Printf("Successfully generated %s for interface %s (in package %s)\n", outPath, *target, info.PkgName)
}

func parseTarget(dir string, targetName string) (*targetInfo, error) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, dir, func(fi os.FileInfo) bool {
		name := fi.Name()
		return !strings.HasSuffix(name, "_test.go") &&
			!strings.HasSuffix(name, "_tx.go") &&
			!strings.HasSuffix(name, "_log.go")
	}, parser.ParseComments)
	if err != nil {
		return nil, fmt.Errorf("parse dir: %w", err)
	}

	var foundPkgName string
	var foundInterface *ast.InterfaceType
	var sourceFiles []*ast.File

	for pkgName, pkg := range pkgs {
		for _, file := range pkg.Files {
			sourceFiles = append(sourceFiles, file)
			ast.Inspect(file, func(n ast.Node) bool {
				ts, ok := n.(*ast.TypeSpec)
				if !ok {
					return true
				}
				if ts.Name.Name == targetName {
					if iface, ok := ts.Type.(*ast.InterfaceType); ok {
						foundInterface = iface
						foundPkgName = pkgName
					}
				}
				return true
			})
		}
	}

	if foundInterface == nil {
		return nil, fmt.Errorf("interface %s not found in %s", targetName, dir)
	}

	// Map all available imports from source files
	availableImports := make(map[string]string)
	for _, file := range sourceFiles {
		for _, imp := range file.Imports {
			path := strings.Trim(imp.Path.Value, `"`)
			if imp.Name != nil && imp.Name.Name != "" && imp.Name.Name != "_" {
				availableImports[imp.Name.Name] = path
			} else {
				parts := strings.Split(path, "/")
				pkg := parts[len(parts)-1]
				availableImports[pkg] = path
			}
		}
	}

	usedPkgs := make(map[string]bool)
	var methods []methodInfo

	for _, field := range foundInterface.Methods.List {
		if len(field.Names) == 0 {
			// Embedded interface, skip
			continue
		}
		mName := field.Names[0].Name
		ft, ok := field.Type.(*ast.FuncType)
		if !ok {
			continue
		}

		docText := ""
		if field.Doc != nil {
			docText = field.Doc.Text()
		}
		if field.Comment != nil {
			docText += "\n" + field.Comment.Text()
		}

		skipLogging := strings.Contains(docText, "@nolog") ||
			strings.Contains(docText, "//log:skip") ||
			strings.Contains(docText, "@log:skip")

		// Collect package qualifiers in parameters and results
		ast.Inspect(ft, func(n ast.Node) bool {
			if sel, ok := n.(*ast.SelectorExpr); ok {
				if id, ok := sel.X.(*ast.Ident); ok {
					usedPkgs[id.Name] = true
				}
			}
			return true
		})

		// Parse parameters
		var params []methodParam
		paramIdx := 0
		if ft.Params != nil {
			for _, p := range ft.Params.List {
				typeStr := exprToString(fset, p.Type)
				if len(p.Names) == 0 {
					name := fmt.Sprintf("arg%d", paramIdx)
					if typeStr == "context.Context" {
						name = "ctx"
					}
					params = append(params, methodParam{Name: name, Type: typeStr})
					paramIdx++
				} else {
					for _, nameIdent := range p.Names {
						params = append(params, methodParam{Name: nameIdent.Name, Type: typeStr})
						paramIdx++
					}
				}
			}
		}

		// Parse results
		var results []methodResult
		if ft.Results != nil {
			for _, r := range ft.Results.List {
				typeStr := exprToString(fset, r.Type)
				if len(r.Names) == 0 {
					results = append(results, methodResult{Type: typeStr})
				} else {
					for range r.Names {
						results = append(results, methodResult{Type: typeStr})
					}
				}
			}
		}

		methods = append(methods, methodInfo{
			Name:        mName,
			Doc:         strings.TrimSpace(docText),
			SkipLogging: skipLogging,
			Params:      params,
			Results:     results,
		})
	}

	// Filter imports to only those used
	neededImports := make(map[string]string)
	for pkg := range usedPkgs {
		if path, ok := availableImports[pkg]; ok {
			neededImports[pkg] = path
		}
	}

	return &targetInfo{
		PkgName:    foundPkgName,
		TargetName: targetName,
		Component:  foundPkgName,
		Methods:    methods,
		Imports:    neededImports,
	}, nil
}

func exprToString(fset *token.FileSet, expr ast.Expr) string {
	var buf bytes.Buffer
	_ = printer.Fprint(&buf, fset, expr)
	return buf.String()
}

func zeroValueOf(typeStr string) string {
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
	default:
		return typeStr + "{}"
	}
}

func generateDecorator(info *targetInfo) ([]byte, error) {
	var buf bytes.Buffer

	decoratorName := "Logging" + info.TargetName

	buf.WriteString("// Code generated by loggen. DO NOT EDIT.\n\n")
	buf.WriteString(fmt.Sprintf("package %s\n\n", info.PkgName))

	// Collect all imports
	importPaths := make(map[string]string)
	importPaths["context"] = ""
	importPaths["time"] = ""
	importPaths["github.com/masterkeysrd/saturn/internal/platform/log"] = ""

	for alias, path := range info.Imports {
		parts := strings.Split(path, "/")
		defaultPkg := parts[len(parts)-1]
		if alias != defaultPkg {
			importPaths[path] = alias
		} else {
			if _, exists := importPaths[path]; !exists {
				importPaths[path] = ""
			}
		}
	}

	var sortedPaths []string
	for p := range importPaths {
		sortedPaths = append(sortedPaths, p)
	}
	sort.Strings(sortedPaths)

	buf.WriteString("import (\n")
	for _, p := range sortedPaths {
		alias := importPaths[p]
		if alias != "" {
			buf.WriteString(fmt.Sprintf("\t%s %q\n", alias, p))
		} else {
			buf.WriteString(fmt.Sprintf("\t%q\n", p))
		}
	}
	buf.WriteString(")\n\n")

	// Struct definition
	buf.WriteString(fmt.Sprintf("// %s wraps a %s and logs operation durations and errors.\n", decoratorName, info.TargetName))
	buf.WriteString(fmt.Sprintf("type %s struct {\n", decoratorName))
	buf.WriteString(fmt.Sprintf("\tnext   %s\n", info.TargetName))
	buf.WriteString("\tlogger log.Logger\n")
	buf.WriteString("}\n\n")

	// Constructor
	buf.WriteString(fmt.Sprintf("// New%s creates a new %s decorator.\n", decoratorName, decoratorName))
	buf.WriteString(fmt.Sprintf("func New%s(next %s, logger log.Logger) *%s {\n", decoratorName, info.TargetName, decoratorName))
	buf.WriteString(fmt.Sprintf("\treturn &%s{\n", decoratorName))
	buf.WriteString("\t\tnext:   next,\n")
	buf.WriteString("\t\tlogger: logger,\n")
	buf.WriteString("\t}\n")
	buf.WriteString("}\n\n")

	// Interface compile assertion
	buf.WriteString(fmt.Sprintf("// Compile-time interface assertion.\nvar _ %s = (*%s)(nil)\n\n", info.TargetName, decoratorName))

	// Methods
	for _, m := range info.Methods {
		// Build signature parameter string
		var paramDecls []string
		var callArgs []string
		ctxArgName := ""
		for _, p := range m.Params {
			paramDecls = append(paramDecls, fmt.Sprintf("%s %s", p.Name, p.Type))
			if strings.HasPrefix(p.Type, "...") {
				callArgs = append(callArgs, p.Name+"...")
			} else {
				callArgs = append(callArgs, p.Name)
			}
			if ctxArgName == "" && (p.Type == "context.Context" || strings.HasSuffix(p.Type, ".Context")) {
				ctxArgName = p.Name
			}
		}
		paramsSig := strings.Join(paramDecls, ", ")

		if ctxArgName == "" {
			ctxArgName = "context.Background()"
		}

		// Build return signature string
		var retTypes []string
		for _, r := range m.Results {
			retTypes = append(retTypes, r.Type)
		}
		retSig := strings.Join(retTypes, ", ")
		if len(retTypes) > 1 {
			retSig = "(" + retSig + ")"
		}

		if m.SkipLogging {
			// Direct pass-through
			if len(m.Results) == 0 {
				buf.WriteString(fmt.Sprintf("func (l *%s) %s(%s) {\n", decoratorName, m.Name, paramsSig))
				buf.WriteString(fmt.Sprintf("\tl.next.%s(%s)\n", m.Name, strings.Join(callArgs, ", ")))
				buf.WriteString("}\n\n")
			} else {
				buf.WriteString(fmt.Sprintf("func (l *%s) %s(%s) %s {\n", decoratorName, m.Name, paramsSig, retSig))
				buf.WriteString(fmt.Sprintf("\treturn l.next.%s(%s)\n", m.Name, strings.Join(callArgs, ", ")))
				buf.WriteString("}\n\n")
			}
			continue
		}

		hasError := len(m.Results) > 0 && m.Results[len(m.Results)-1].Type == "error"
		msgOp := fmt.Sprintf("%s.%s", info.Component, m.Name)

		buf.WriteString(fmt.Sprintf("// %s executes next.%s and logs execution duration and errors.\n", m.Name, m.Name))
		if len(m.Results) == 0 {
			buf.WriteString(fmt.Sprintf("func (l *%s) %s(%s) {\n", decoratorName, m.Name, paramsSig))
			buf.WriteString("\tstart := time.Now()\n")
			buf.WriteString(fmt.Sprintf("\tl.next.%s(%s)\n", m.Name, strings.Join(callArgs, ", ")))
			buf.WriteString("\tduration := time.Since(start)\n\n")
			buf.WriteString(fmt.Sprintf("\tl.logger.Info(%s, %q,\n", ctxArgName, msgOp+" completed"))
			buf.WriteString(fmt.Sprintf("\t\tlog.String(\"component\", %q),\n", info.Component))
			buf.WriteString(fmt.Sprintf("\t\tlog.String(\"operation\", %q),\n", m.Name))
			buf.WriteString("\t\tlog.Duration(\"duration\", duration),\n")
			buf.WriteString("\t)\n")
			buf.WriteString("}\n\n")
			continue
		}

		buf.WriteString(fmt.Sprintf("func (l *%s) %s(%s) %s {\n", decoratorName, m.Name, paramsSig, retSig))
		buf.WriteString("\tstart := time.Now()\n")

		if hasError {
			// Zero values for non-error returns
			var zeroReturns []string
			for i := 0; i < len(m.Results)-1; i++ {
				zeroReturns = append(zeroReturns, zeroValueOf(m.Results[i].Type))
			}

			if len(m.Results) == 1 {
				buf.WriteString(fmt.Sprintf("\terr := l.next.%s(%s)\n", m.Name, strings.Join(callArgs, ", ")))
				buf.WriteString("\tduration := time.Since(start)\n\n")
				buf.WriteString("\tif err != nil {\n")
				buf.WriteString(fmt.Sprintf("\t\tl.logger.Error(%s, %q,\n", ctxArgName, msgOp+" failed"))
				buf.WriteString(fmt.Sprintf("\t\t\tlog.String(\"component\", %q),\n", info.Component))
				buf.WriteString(fmt.Sprintf("\t\t\tlog.String(\"operation\", %q),\n", m.Name))
				buf.WriteString("\t\t\tlog.Duration(\"duration\", duration),\n")
				buf.WriteString("\t\t\tlog.Err(err),\n")
				buf.WriteString("\t\t)\n")
				buf.WriteString("\t\treturn err\n")
				buf.WriteString("\t}\n\n")

				buf.WriteString(fmt.Sprintf("\tl.logger.Info(%s, %q,\n", ctxArgName, msgOp+" completed"))
				buf.WriteString(fmt.Sprintf("\t\tlog.String(\"component\", %q),\n", info.Component))
				buf.WriteString(fmt.Sprintf("\t\tlog.String(\"operation\", %q),\n", m.Name))
				buf.WriteString("\t\tlog.Duration(\"duration\", duration),\n")
				buf.WriteString("\t)\n")
				buf.WriteString("\treturn nil\n")
			} else if len(m.Results) == 2 {
				buf.WriteString(fmt.Sprintf("\tres, err := l.next.%s(%s)\n", m.Name, strings.Join(callArgs, ", ")))
				buf.WriteString("\tduration := time.Since(start)\n\n")
				buf.WriteString("\tif err != nil {\n")
				buf.WriteString(fmt.Sprintf("\t\tl.logger.Error(%s, %q,\n", ctxArgName, msgOp+" failed"))
				buf.WriteString(fmt.Sprintf("\t\t\tlog.String(\"component\", %q),\n", info.Component))
				buf.WriteString(fmt.Sprintf("\t\t\tlog.String(\"operation\", %q),\n", m.Name))
				buf.WriteString("\t\t\tlog.Duration(\"duration\", duration),\n")
				buf.WriteString("\t\t\tlog.Err(err),\n")
				buf.WriteString("\t\t)\n")
				buf.WriteString(fmt.Sprintf("\t\treturn %s, err\n", zeroReturns[0]))
				buf.WriteString("\t}\n\n")

				buf.WriteString(fmt.Sprintf("\tl.logger.Info(%s, %q,\n", ctxArgName, msgOp+" completed"))
				buf.WriteString(fmt.Sprintf("\t\tlog.String(\"component\", %q),\n", info.Component))
				buf.WriteString(fmt.Sprintf("\t\tlog.String(\"operation\", %q),\n", m.Name))
				buf.WriteString("\t\tlog.Duration(\"duration\", duration),\n")
				buf.WriteString("\t)\n")
				buf.WriteString("\treturn res, nil\n")
			} else {
				var resNames []string
				for i := 0; i < len(m.Results)-1; i++ {
					resNames = append(resNames, fmt.Sprintf("res%d", i+1))
				}
				buf.WriteString(fmt.Sprintf("\t%s, err := l.next.%s(%s)\n", strings.Join(resNames, ", "), m.Name, strings.Join(callArgs, ", ")))
				buf.WriteString("\tduration := time.Since(start)\n\n")
				buf.WriteString("\tif err != nil {\n")
				buf.WriteString(fmt.Sprintf("\t\tl.logger.Error(%s, %q,\n", ctxArgName, msgOp+" failed"))
				buf.WriteString(fmt.Sprintf("\t\t\tlog.String(\"component\", %q),\n", info.Component))
				buf.WriteString(fmt.Sprintf("\t\t\tlog.String(\"operation\", %q),\n", m.Name))
				buf.WriteString("\t\t\tlog.Duration(\"duration\", duration),\n")
				buf.WriteString("\t\t\tlog.Err(err),\n")
				buf.WriteString("\t\t)\n")
				buf.WriteString(fmt.Sprintf("\t\treturn %s, err\n", strings.Join(zeroReturns, ", ")))
				buf.WriteString("\t}\n\n")

				buf.WriteString(fmt.Sprintf("\tl.logger.Info(%s, %q,\n", ctxArgName, msgOp+" completed"))
				buf.WriteString(fmt.Sprintf("\t\tlog.String(\"component\", %q),\n", info.Component))
				buf.WriteString(fmt.Sprintf("\t\tlog.String(\"operation\", %q),\n", m.Name))
				buf.WriteString("\t\tlog.Duration(\"duration\", duration),\n")
				buf.WriteString("\t)\n")
				buf.WriteString(fmt.Sprintf("\treturn %s, nil\n", strings.Join(resNames, ", ")))
			}
		} else {
			// No error in return values
			if len(m.Results) == 1 {
				buf.WriteString(fmt.Sprintf("\tres := l.next.%s(%s)\n", m.Name, strings.Join(callArgs, ", ")))
				buf.WriteString("\tduration := time.Since(start)\n\n")
				buf.WriteString(fmt.Sprintf("\tl.logger.Info(%s, %q,\n", ctxArgName, msgOp+" completed"))
				buf.WriteString(fmt.Sprintf("\t\tlog.String(\"component\", %q),\n", info.Component))
				buf.WriteString(fmt.Sprintf("\t\tlog.String(\"operation\", %q),\n", m.Name))
				buf.WriteString("\t\tlog.Duration(\"duration\", duration),\n")
				buf.WriteString("\t)\n")
				buf.WriteString("\treturn res\n")
			} else {
				var resNames []string
				for i := range m.Results {
					resNames = append(resNames, fmt.Sprintf("res%d", i+1))
				}
				buf.WriteString(fmt.Sprintf("\t%s := l.next.%s(%s)\n", strings.Join(resNames, ", "), m.Name, strings.Join(callArgs, ", ")))
				buf.WriteString("\tduration := time.Since(start)\n\n")
				buf.WriteString(fmt.Sprintf("\tl.logger.Info(%s, %q,\n", ctxArgName, msgOp+" completed"))
				buf.WriteString(fmt.Sprintf("\t\tlog.String(\"component\", %q),\n", info.Component))
				buf.WriteString(fmt.Sprintf("\t\tlog.String(\"operation\", %q),\n", m.Name))
				buf.WriteString("\t\tlog.Duration(\"duration\", duration),\n")
				buf.WriteString("\t)\n")
				buf.WriteString(fmt.Sprintf("\treturn %s\n", strings.Join(resNames, ", ")))
			}
		}

		buf.WriteString("}\n\n")
	}

	formatted, err := format.Source(buf.Bytes())
	if err != nil {
		return nil, fmt.Errorf("format generated code: %w\nRaw Code:\n%s", err, buf.String())
	}

	return formatted, nil
}

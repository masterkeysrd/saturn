package codegen

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"path/filepath"
	"strings"
)

// DefaultFilter filters out test files, hidden files, and generated files.
func DefaultFilter(fi os.FileInfo) bool {
	name := fi.Name()
	return !strings.HasPrefix(name, ".") &&
		!strings.HasSuffix(name, "_test.go") &&
		!strings.HasSuffix(name, "_tx.go") &&
		!strings.HasSuffix(name, "_log.go") &&
		!strings.HasSuffix(name, "mocks_test.go")
}

// ExprToString converts an ast.Expr node back to its Go source string representation.
func ExprToString(fset *token.FileSet, expr ast.Expr) string {
	var buf bytes.Buffer
	_ = printer.Fprint(&buf, fset, expr)
	return buf.String()
}

// ParseDir parses all Go files in dir matching the filter and extracts all interface definitions.
// If no filter is provided, DefaultFilter is used.
func ParseDir(dir string, filter ...func(fi os.FileInfo) bool) ([]*InterfaceInfo, error) {
	filterFn := DefaultFilter
	if len(filter) > 0 && filter[0] != nil {
		filterFn = filter[0]
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read dir %s: %w", dir, err)
	}

	fset := token.NewFileSet()
	pkgs := make(map[string][]*ast.File)

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if !filterFn(info) || !strings.HasSuffix(entry.Name(), ".go") {
			continue
		}

		filePath := filepath.Join(dir, entry.Name())
		file, err := parser.ParseFile(fset, filePath, nil, parser.ParseComments)
		if err != nil {
			return nil, fmt.Errorf("parse file %s: %w", filePath, err)
		}

		pkgName := file.Name.Name
		pkgs[pkgName] = append(pkgs[pkgName], file)
	}

	var results []*InterfaceInfo

	for pkgName, files := range pkgs {
		if strings.HasSuffix(pkgName, "_test") && len(pkgs) > 1 {
			// Skip separate test package if standard package exists
			continue
		}

		// Collect package-level imports
		pkgImports := make(map[string]string)
		for _, file := range files {
			for _, imp := range file.Imports {
				path := strings.Trim(imp.Path.Value, `"`)
				if imp.Name != nil && imp.Name.Name != "" && imp.Name.Name != "_" {
					pkgImports[imp.Name.Name] = path
				} else {
					parts := strings.Split(path, "/")
					pkgImports[parts[len(parts)-1]] = path
				}
			}
		}

		// Inspect each file in the package
		for _, file := range files {
			fileImports := make(map[string]string)
			for _, imp := range file.Imports {
				path := strings.Trim(imp.Path.Value, `"`)
				if imp.Name != nil && imp.Name.Name != "" && imp.Name.Name != "_" {
					fileImports[imp.Name.Name] = path
				} else {
					parts := strings.Split(path, "/")
					fileImports[parts[len(parts)-1]] = path
				}
			}

			ast.Inspect(file, func(n ast.Node) bool {
				decl, ok := n.(*ast.GenDecl)
				if !ok || decl.Tok != token.TYPE {
					return true
				}

				for _, spec := range decl.Specs {
					ts, ok := spec.(*ast.TypeSpec)
					if !ok {
						continue
					}

					iface, ok := ts.Type.(*ast.InterfaceType)
					if !ok {
						continue
					}

					var docLines []string
					if decl.Doc != nil {
						docLines = append(docLines, decl.Doc.Text())
					}
					if ts.Doc != nil {
						docLines = append(docLines, ts.Doc.Text())
					}
					if ts.Comment != nil {
						docLines = append(docLines, ts.Comment.Text())
					}
					docText := strings.TrimSpace(strings.Join(docLines, "\n"))

					usedPkgs := make(map[string]bool)
					var methods []MethodInfo

					for _, field := range iface.Methods.List {
						if len(field.Names) == 0 {
							// Embedded interface, skip
							continue
						}
						mName := field.Names[0].Name
						ft, ok := field.Type.(*ast.FuncType)
						if !ok {
							continue
						}

						methodDoc := ""
						if field.Doc != nil {
							methodDoc = field.Doc.Text()
						}
						if field.Comment != nil {
							methodDoc += "\n" + field.Comment.Text()
						}

						// Collect package qualifiers in parameters and results
						ast.Inspect(ft, func(node ast.Node) bool {
							if sel, ok := node.(*ast.SelectorExpr); ok {
								if id, ok := sel.X.(*ast.Ident); ok {
									usedPkgs[id.Name] = true
								}
							}
							return true
						})

						// Parse parameters
						var params []Param
						paramIdx := 0
						if ft.Params != nil {
							for _, p := range ft.Params.List {
								typeStr := ExprToString(fset, p.Type)
								isVariadic := strings.HasPrefix(typeStr, "...")
								if len(p.Names) == 0 {
									name := fmt.Sprintf("arg%d", paramIdx)
									if typeStr == "context.Context" {
										name = "ctx"
									}
									params = append(params, Param{
										Name:       name,
										Type:       typeStr,
										IsVariadic: isVariadic,
									})
									paramIdx++
								} else {
									for _, nameIdent := range p.Names {
										params = append(params, Param{
											Name:       nameIdent.Name,
											Type:       typeStr,
											IsVariadic: isVariadic,
										})
										paramIdx++
									}
								}
							}
						}

						// Parse results
						var resultsList []Result
						if ft.Results != nil {
							for _, r := range ft.Results.List {
								typeStr := ExprToString(fset, r.Type)
								zeroVal := ZeroValueOf(typeStr)
								if len(r.Names) == 0 {
									resultsList = append(resultsList, Result{
										Type:      typeStr,
										ZeroValue: zeroVal,
									})
								} else {
									for _, nameIdent := range r.Names {
										resultsList = append(resultsList, Result{
											Name:      nameIdent.Name,
											Type:      typeStr,
											ZeroValue: zeroVal,
										})
									}
								}
							}
						}

						methods = append(methods, MethodInfo{
							Name:    mName,
							Doc:     strings.TrimSpace(methodDoc),
							Params:  params,
							Results: resultsList,
						})
					}

					// Resolve imports used in this interface
					neededImports := make(map[string]string)
					for pkg := range usedPkgs {
						if path, ok := fileImports[pkg]; ok {
							neededImports[pkg] = path
						} else if path, ok := pkgImports[pkg]; ok {
							neededImports[pkg] = path
						}
					}

					results = append(results, &InterfaceInfo{
						PkgName: pkgName,
						Dir:     dir,
						Name:    ts.Name.Name,
						Doc:     docText,
						Methods: methods,
						Imports: neededImports,
					})
				}
				return true
			})
		}
	}

	return results, nil
}

// ParseTarget locates and extracts a single interface by name from dir.
func ParseTarget(dir string, targetName string) (*InterfaceInfo, error) {
	ifaces, err := ParseDir(dir)
	if err != nil {
		return nil, err
	}

	for _, iface := range ifaces {
		if iface.Name == targetName {
			return iface, nil
		}
	}

	return nil, fmt.Errorf("interface %s not found in %s", targetName, dir)
}

// FindInterfacesWithAnnotation extracts all interfaces in dir that have the specified doc annotation (e.g. "@Mock").
func FindInterfacesWithAnnotation(dir string, tag string) ([]*InterfaceInfo, error) {
	ifaces, err := ParseDir(dir)
	if err != nil {
		return nil, err
	}

	var matched []*InterfaceInfo
	for _, iface := range ifaces {
		if iface.HasAnnotation(tag) {
			matched = append(matched, iface)
		}
	}

	return matched, nil
}

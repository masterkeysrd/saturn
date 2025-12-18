package sqlgen

import (
	"bufio"
	"fmt"
	"io"
	"regexp"
	"strings"

	"github.com/jmoiron/sqlx"
)

type Parser struct {
	db              *sqlx.DB
	nameRegex       *regexp.Regexp
	paramRegex      *regexp.Regexp
	paramTypeRegex  *regexp.Regexp
	returnRegex     *regexp.Regexp
	returnTypeRegex *regexp.Regexp
	typeCache       map[string]ColumnTypeInfo
}

func NewParser(db *sqlx.DB) *Parser {
	return &Parser{
		db:              db,
		nameRegex:       regexp.MustCompile(`--\s*name:\s*(\w+)`),
		paramRegex:      regexp.MustCompile(`:([a-zA-Z0-9_]+)`),
		paramTypeRegex:  regexp.MustCompile(`--\s*param_type:\s*(\w+)`),
		returnRegex:     regexp.MustCompile(`--\s*return:\s*(one|many|exec)`),
		returnTypeRegex: regexp.MustCompile(`--\s*return_type:\s*(\w+)`),
		typeCache:       make(map[string]ColumnTypeInfo),
	}
}

func (p *Parser) Parse(file io.Reader) ([]QueryDef, error) {
	var queries []QueryDef
	var currentQuery *QueryDef
	var sqlBuffer strings.Builder
	var explicitCmd QueryCmd

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()

		// Check for -- name: directive
		if matches := p.nameRegex.FindStringSubmatch(line); len(matches) > 1 {
			if currentQuery != nil {
				if err := p.finalizeQuery(currentQuery, sqlBuffer.String(), explicitCmd); err != nil {
					return nil, fmt.Errorf("extracting params for query %s: %w", currentQuery.Name, err)
				}
				queries = append(queries, *currentQuery)
				sqlBuffer.Reset()
				explicitCmd = ""
			}
			currentQuery = &QueryDef{
				Name:   matches[1],
				GoName: toGoIdentifier(matches[1]),
			}
			continue
		}

		// Check for -- param_type: directive
		if matches := p.paramTypeRegex.FindStringSubmatch(line); len(matches) > 1 {
			if currentQuery != nil {
				currentQuery.CustomParamType = matches[1]
			}
			continue
		}

		// Check for -- return: directive
		if matches := p.returnRegex.FindStringSubmatch(line); len(matches) > 1 {
			if currentQuery != nil {
				switch matches[1] {
				case "one":
					explicitCmd = CmdOne
				case "many":
					explicitCmd = CmdMany
				case "exec":
					explicitCmd = CmdExec
				}
			}
			continue
		}

		// Check for -- return_type: directive
		if matches := p.returnTypeRegex.FindStringSubmatch(line); len(matches) > 1 {
			if currentQuery != nil {
				currentQuery.ReturnType = matches[1]
			}
			continue
		}

		// Process SQL content
		if currentQuery != nil {
			// Skip comment lines
			if strings.HasPrefix(strings.TrimSpace(line), "--") {
				continue
			}
			sqlBuffer.WriteString(line + "\n")
		}
	}

	// Finalize last query
	if currentQuery != nil {
		if err := p.finalizeQuery(currentQuery, sqlBuffer.String(), explicitCmd); err != nil {
			return nil, fmt.Errorf("extracting params for query %s: %w", currentQuery.Name, err)
		}
		queries = append(queries, *currentQuery)
	}

	return queries, scanner.Err()
}

func (p *Parser) finalizeQuery(query *QueryDef, rawSQL string, explicitCmd QueryCmd) error {
	query.OriginalSQL = strings.TrimSpace(rawSQL)

	paramsMap := make(map[string]int)
	var params []ParamDef
	nextIndex := 1

	// Determine query command type
	upperSQL := strings.ToUpper(query.OriginalSQL)
	if explicitCmd != "" {
		query.Cmd = explicitCmd
	} else if strings.HasPrefix(upperSQL, "SELECT") {
		if strings.Contains(upperSQL, "LIMIT 1") {
			query.Cmd = CmdOne
		} else {
			query.Cmd = CmdMany
		}
	} else {
		query.Cmd = CmdExec
	}

	// Convert : param to $1, $2, etc.
	preparedSQL := p.paramRegex.ReplaceAllStringFunc(rawSQL, func(m string) string {
		paramName := m[1:]

		idx, exists := paramsMap[paramName]
		if !exists {
			idx = nextIndex
			paramsMap[paramName] = idx
			params = append(params, ParamDef{
				Name:       paramName,
				GoName:     toGoIdentifier(paramName),
				Type:       "any",
				IsNullable: false,
			})
			nextIndex++
		}
		return fmt.Sprintf("$%d", idx)
	})

	query.PreparedSQL = strings.TrimSpace(preparedSQL)

	// Extract column-to-parameter mappings from the SQL
	paramColumnMap := p.extractParamColumnMapping(preparedSQL, paramsMap)

	// Infer types based on database schema
	for i, param := range params {
		if colInfo, ok := paramColumnMap[param.Name]; ok {
			typeInfo, err := p.getColumnTypeInfo(colInfo.Table, colInfo.Column)
			if err != nil {
				// Fallback to any if lookup fails
				params[i].Type = "any"
				continue
			}

			params[i].Type = typeInfo.GoType
			params[i].IsNullable = typeInfo.IsNullable
			params[i].GoImport = typeInfo.GoImport
		}
	}

	query.Params = params
	return nil
}

type ColumnInfo struct {
	Table  string
	Column string
}

type ColumnTypeInfo struct {
	GoType     string
	GoImport   string
	IsNullable bool
	DBType     string
}

func (p *Parser) extractParamColumnMapping(preparedSQL string, paramsMap map[string]int) map[string]ColumnInfo {
	result := make(map[string]ColumnInfo)

	// Extract table names
	tables := p.extractTables(preparedSQL)
	if len(tables) == 0 {
		return result
	}
	primaryTable := tables[0]

	// Reverse lookup:  $index -> param name
	indexToParam := make(map[int]string)
	for paramName, idx := range paramsMap {
		indexToParam[idx] = paramName
	}

	// Match various SQL patterns with parameters
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)([\w.]+)\s*=\s*\$(\d+)`),            // column = $1
		regexp.MustCompile(`(?i)([\w.]+)\s+IN\s*\(\s*\$(\d+)\s*\)`), // column IN ($1)
		regexp.MustCompile(`(?i)([\w.]+)\s*<\s*\$(\d+)`),            // column < $1
		regexp.MustCompile(`(?i)([\w.]+)\s*>\s*\$(\d+)`),            // column > $1
		regexp.MustCompile(`(?i)([\w.]+)\s*<=\s*\$(\d+)`),           // column <= $1
		regexp.MustCompile(`(?i)([\w.]+)\s*>=\s*\$(\d+)`),           // column >= $1
		regexp.MustCompile(`(?i)([\w.]+)\s*!=\s*\$(\d+)`),           // column != $1
		regexp.MustCompile(`(?i)([\w.]+)\s+LIKE\s+\$(\d+)`),         // column LIKE $1
		regexp.MustCompile(`(?i)([\w.]+)\s+ILIKE\s+\$(\d+)`),        // column ILIKE $1
	}

	for _, pattern := range patterns {
		matches := pattern.FindAllStringSubmatch(preparedSQL, -1)
		for _, match := range matches {
			if len(match) < 3 {
				continue
			}

			rawColumnName := match[1]
			// Clean column name (remove table alias if present, e.g.  "u.id" -> "id")
			columnName := rawColumnName
			if idx := strings.LastIndex(rawColumnName, "."); idx != -1 {
				columnName = rawColumnName[idx+1:]
			}

			// Skip SQL keywords
			if p.isSQLKeyword(columnName) {
				continue
			}

			paramIndex := 0
			fmt.Sscanf(match[2], "%d", &paramIndex)

			if paramName, ok := indexToParam[paramIndex]; ok {
				result[paramName] = ColumnInfo{
					Table:  primaryTable,
					Column: columnName,
				}
			}
		}
	}

	// Handle SET clause in UPDATE statements - simpler approach
	// Find the SET keyword and extract until WHERE
	upperSQL := strings.ToUpper(preparedSQL)
	setIdx := strings.Index(upperSQL, "SET")
	whereIdx := strings.Index(upperSQL, "WHERE")

	if setIdx != -1 {
		endIdx := len(preparedSQL)
		if whereIdx != -1 && whereIdx > setIdx {
			endIdx = whereIdx
		}

		setClause := preparedSQL[setIdx+3 : endIdx]

		// Parse individual SET assignments:  column = $N
		assignRegex := regexp.MustCompile(`(\w+)\s*=\s*\$(\d+)`)
		assigns := assignRegex.FindAllStringSubmatch(setClause, -1)

		for _, assign := range assigns {
			if len(assign) < 3 {
				continue
			}

			columnName := assign[1]
			if p.isSQLKeyword(columnName) {
				continue
			}

			paramIndex := 0
			fmt.Sscanf(assign[2], "%d", &paramIndex)

			if paramName, ok := indexToParam[paramIndex]; ok {
				result[paramName] = ColumnInfo{
					Table:  primaryTable,
					Column: columnName,
				}
			}
		}
	}

	// Handle INSERT INTO patterns
	insertRegex := regexp.MustCompile(`(?i)INSERT\s+INTO\s+([\w.]+)\s*\(([^)]+)\)`)
	if insertMatch := insertRegex.FindStringSubmatch(preparedSQL); len(insertMatch) > 2 {
		tableName := insertMatch[1]
		// Clean table name if it has schema prefix
		if idx := strings.LastIndex(tableName, ". "); idx != -1 {
			tableName = tableName[idx+1:]
		}

		columns := strings.Split(insertMatch[2], ",")

		// Extract VALUES clause
		valuesRegex := regexp.MustCompile(`(?i)VALUES\s*\(([^)]+)\)`)
		if valuesMatch := valuesRegex.FindStringSubmatch(preparedSQL); len(valuesMatch) > 1 {
			values := strings.Split(valuesMatch[1], ",")

			for i, col := range columns {
				if i >= len(values) {
					break
				}

				colName := strings.TrimSpace(col)
				value := strings.TrimSpace(values[i])

				// Check if value is a parameter placeholder
				if paramMatch := regexp.MustCompile(`\$(\d+)`).FindStringSubmatch(value); len(paramMatch) > 1 {
					paramIndex := 0
					fmt.Sscanf(paramMatch[1], "%d", &paramIndex)

					if paramName, ok := indexToParam[paramIndex]; ok {
						result[paramName] = ColumnInfo{
							Table:  tableName,
							Column: colName,
						}
					}
				}
			}
		}
	}

	// Fallback:  try to match parameter names to column names directly
	for paramName := range paramsMap {
		if _, exists := result[paramName]; !exists {
			// Try to find a column with matching name
			if p.columnExists(primaryTable, paramName) {
				result[paramName] = ColumnInfo{
					Table:  primaryTable,
					Column: paramName,
				}
			}
		}
	}

	return result
}

func (p *Parser) isSQLKeyword(word string) bool {
	keywords := map[string]bool{
		"SELECT": true, "FROM": true, "WHERE": true, "AND": true, "OR": true,
		"INSERT": true, "UPDATE": true, "DELETE": true, "SET": true, "VALUES": true,
		"JOIN": true, "LEFT": true, "RIGHT": true, "INNER": true, "OUTER": true,
		"ON": true, "AS": true, "IN": true, "NOT": true, "NULL": true, "IS": true,
		"LIKE": true, "BETWEEN": true, "ORDER": true, "BY": true, "GROUP": true,
		"HAVING": true, "LIMIT": true, "OFFSET": true, "DISTINCT": true,
		"CASE": true, "WHEN": true, "THEN": true, "ELSE": true, "END": true,
		"EXISTS": true, "ALL": true, "ANY": true, "SOME": true,
		"EXCLUDED": true, "CONFLICT": true, "DO": true,
	}
	return keywords[strings.ToUpper(word)]
}

func (p *Parser) columnExists(tableName, columnName string) bool {
	query := `
		SELECT COUNT(*)
		FROM information_schema.columns
		WHERE table_name = $1 AND column_name = $2
	`

	var count int
	err := p.db.QueryRow(query, tableName, columnName).Scan(&count)
	if err != nil {
		return false
	}

	return count > 0
}

func (p *Parser) extractTables(sql string) []string {
	var tables []string

	// Extract FROM clause (handles schema. table)
	fromRegex := regexp.MustCompile(`(?i)FROM\s+([a-zA-Z0-9_. ]+)`)
	if matches := fromRegex.FindStringSubmatch(sql); len(matches) > 1 {
		name := matches[1]
		// Strip schema prefix if present
		if idx := strings.LastIndex(name, "."); idx != -1 {
			name = name[idx+1:]
		}
		tables = append(tables, name)
	}

	// Extract JOIN clauses
	joinRegex := regexp.MustCompile(`(?i)JOIN\s+([a-zA-Z0-9_.]+)`)
	joinMatches := joinRegex.FindAllStringSubmatch(sql, -1)
	for _, match := range joinMatches {
		if len(match) > 1 {
			name := match[1]
			if idx := strings.LastIndex(name, "."); idx != -1 {
				name = name[idx+1:]
			}
			tables = append(tables, name)
		}
	}

	// Extract INSERT INTO
	insertRegex := regexp.MustCompile(`(?i)INSERT\s+INTO\s+([a-zA-Z0-9_.]+)`)
	if matches := insertRegex.FindStringSubmatch(sql); len(matches) > 1 {
		name := matches[1]
		if idx := strings.LastIndex(name, "."); idx != -1 {
			name = name[idx+1:]
		}
		tables = append(tables, name)
	}

	// Extract UPDATE
	updateRegex := regexp.MustCompile(`(?i)UPDATE\s+([a-zA-Z0-9_.]+)`)
	if matches := updateRegex.FindStringSubmatch(sql); len(matches) > 1 {
		name := matches[1]
		if idx := strings.LastIndex(name, "."); idx != -1 {
			name = name[idx+1:]
		}
		tables = append(tables, name)
	}

	return tables
}

func (p *Parser) getColumnTypeInfo(tableName, columnName string) (ColumnTypeInfo, error) {
	cacheKey := fmt.Sprintf("%s. %s", tableName, columnName)
	if cached, ok := p.typeCache[cacheKey]; ok {
		return cached, nil
	}

	query := `
		SELECT 
			data_type,
			is_nullable,
			udt_name
		FROM information_schema.columns
		WHERE table_name = $1 AND column_name = $2
	`

	var dataType, isNullable, udtName string
	err := p.db.QueryRow(query, tableName, columnName).Scan(
		&dataType,
		&isNullable,
		&udtName,
	)
	if err != nil {
		return ColumnTypeInfo{}, fmt.Errorf("querying column type for %s.%s: %w", tableName, columnName, err)
	}

	goType, importPath := mapSQLTypeToGoType(udtName)
	nullable := strings.ToUpper(isNullable) == "YES"

	typeInfo := ColumnTypeInfo{
		GoType:     goType,
		GoImport:   importPath,
		IsNullable: nullable,
		DBType:     dataType,
	}

	p.typeCache[cacheKey] = typeInfo
	return typeInfo, nil
}

type QueryDef struct {
	Name            string
	GoName          string
	OriginalSQL     string
	PreparedSQL     string
	Cmd             QueryCmd
	Params          []ParamDef
	CustomParamType string
	ReturnType      string
}

type QueryCmd string

const (
	CmdOne  QueryCmd = "one"  // Returns single struct (Get)
	CmdMany QueryCmd = "many" // Returns slice (Select)
	CmdExec QueryCmd = "exec" // Returns error (Exec)
)

type ParamDef struct {
	Name       string
	GoName     string
	GoImport   string
	Type       string
	IsNullable bool
}

// toGoIdentifier converts snake_case or any identifier to PascalCase
func toGoIdentifier(name string) string {
	// Handle snake_case
	if strings.Contains(name, "_") {
		parts := strings.Split(name, "_")
		for i, part := range parts {
			if len(part) > 0 {
				parts[i] = strings.ToUpper(part[:1]) + strings.ToLower(part[1:])
			}
		}
		return strings.Join(parts, "")
	}

	// Handle camelCase - ensure first letter is uppercase
	if len(name) > 0 {
		return strings.ToUpper(name[:1]) + name[1:]
	}

	return name
}

package sqlgen

import (
	"bufio"
	"fmt"
	"io"
	"regexp"
	"strings"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/pkg/str"
)

type Parser struct {
	db             *sqlx.DB
	nameRegex      *regexp.Regexp
	paramRegex     *regexp.Regexp
	paramTypeRegex *regexp.Regexp
	typeCache      map[string]ColumnTypeInfo
}

func NewParser(db *sqlx.DB) *Parser {
	return &Parser{
		db:             db,
		nameRegex:      regexp.MustCompile(`--\s*name:\s*(\w+)`),
		paramRegex:     regexp.MustCompile(`:([a-zA-Z0-9_]+)`),
		paramTypeRegex: regexp.MustCompile(`--\s*param_type:\s*(\w+)`),
		typeCache:      make(map[string]ColumnTypeInfo),
	}
}

func (p *Parser) Parse(file io.Reader) ([]QueryDef, error) {
	var queries []QueryDef
	var currentQuery *QueryDef
	var sqlBuffer strings.Builder

	// Read file content first to handle multi-line parsing easier if needed,
	// but line-by-line is fine for this format.
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()

		if matches := p.nameRegex.FindStringSubmatch(line); len(matches) > 1 {
			if currentQuery != nil {
				if err := p.extractParams(currentQuery, sqlBuffer.String()); err != nil {
					return nil, fmt.Errorf("extracting params for query %s: %w", currentQuery.Name, err)
				}
				queries = append(queries, *currentQuery)
				sqlBuffer.Reset()
			}
			currentQuery = &QueryDef{
				Name:   matches[1],
				GoName: str.GoCamelCase(matches[1]), // Ensure helper is available or use matches[1]
			}
			continue
		}

		if matches := p.paramTypeRegex.FindStringSubmatch(line); len(matches) > 1 {
			if currentQuery != nil {
				currentQuery.CustomParamType = matches[1]
			}
			continue
		}

		if currentQuery != nil {
			if strings.HasPrefix(strings.TrimSpace(line), "--") {
				continue
			}
			sqlBuffer.WriteString(line + "\n")
		}
	}

	if currentQuery != nil {
		if err := p.extractParams(currentQuery, sqlBuffer.String()); err != nil {
			return nil, fmt.Errorf("extracting params for query %s: %w", currentQuery.Name, err)
		}
		queries = append(queries, *currentQuery)
	}

	return queries, scanner.Err()
}

func (p *Parser) extractParams(query *QueryDef, rawSQL string) error {
	query.OriginalSQL = strings.TrimSpace(rawSQL)

	paramsMap := make(map[string]int)
	var params []ParamDef
	nextIndex := 1

	// Convert :param to $1, $2, etc.
	preparedSQL := p.paramRegex.ReplaceAllStringFunc(rawSQL, func(m string) string {
		paramName := m[1:]

		idx, exists := paramsMap[paramName]
		if !exists {
			idx = nextIndex
			paramsMap[paramName] = idx
			// Add placeholder type, will be resolved later
			params = append(params, ParamDef{
				Name:       paramName,
				GoName:     str.GoCamelCase(paramName),
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

	// Match column = $N patterns (Handles "id = $1" and "u.id = $1")
	// Updated regex to allow dots in column names (e.g. u.id)
	whereRegex := regexp.MustCompile(`(?i)([\w.]+)\s*=\s*\$(\d+)`)
	matches := whereRegex.FindAllStringSubmatch(preparedSQL, -1)

	// Reverse lookup: $index -> param name
	indexToParam := make(map[int]string)
	for paramName, idx := range paramsMap {
		indexToParam[idx] = paramName
	}

	for _, match := range matches {
		if len(match) < 3 {
			continue
		}

		rawColumnName := match[1]
		// Clean column name (remove table alias if present, e.g. "u.id" -> "id")
		columnName := rawColumnName
		if idx := strings.LastIndex(rawColumnName, "."); idx != -1 {
			columnName = rawColumnName[idx+1:]
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

	// Check INSERT INTO patterns
	insertRegex := regexp.MustCompile(`(?i)INSERT\s+INTO\s+([\w.]+)\s*\(([^)]+)\)`)
	if insertMatch := insertRegex.FindStringSubmatch(preparedSQL); len(insertMatch) > 2 {
		tableName := insertMatch[1]
		// Clean table name if it has schema prefix
		if idx := strings.LastIndex(tableName, "."); idx != -1 {
			tableName = tableName[idx+1:]
		}

		columns := strings.Split(insertMatch[2], ",")

		valuesRegex := regexp.MustCompile(`(?i)VALUES\s*\(([^)]+)\)`)
		if valuesMatch := valuesRegex.FindStringSubmatch(preparedSQL); len(valuesMatch) > 1 {
			values := strings.Split(valuesMatch[1], ",")

			for i, col := range columns {
				if i >= len(values) {
					break
				}

				colName := strings.TrimSpace(col)
				value := strings.TrimSpace(values[i])

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

	return result
}

func (p *Parser) extractTables(sql string) []string {
	var tables []string

	// Updated regex to handle schema prefixes (public.users)
	fromRegex := regexp.MustCompile(`(?i)FROM\s+([a-zA-Z0-9_.]+)`)
	if matches := fromRegex.FindStringSubmatch(sql); len(matches) > 1 {
		name := matches[1]
		// If table has alias "users u", logic handles that via split elsewhere or just grabbing name
		// For simplicity, we just take the name. If it's "public.users", we strip schema later or let DB query handle it?
		// Usually information_schema query looks up by table_name. We should probably strip schema.
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
	cacheKey := fmt.Sprintf("%s.%s", tableName, columnName)
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
	// Removed unused maxLen, precision scan args to fit query
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
	Params          []ParamDef
	CustomParamType string
}

// ParamDef definition included here as it was part of the provided snippet
type ParamDef struct {
	Name       string
	GoName     string
	GoImport   string
	Type       string
	IsNullable bool
}

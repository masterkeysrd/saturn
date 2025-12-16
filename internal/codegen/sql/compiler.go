package sqlgen

import (
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/pkg/text"
)

type Inspector struct {
	db *sqlx.DB
}

func NewInspector(db *sqlx.DB) *Inspector {
	return &Inspector{db: db}
}

func (i *Inspector) ListTables(schema string) ([]TableDef, error) {
	query := `
    SELECT
      table_name
    FROM
      information_schema.tables
    WHERE
      table_schema = $1
        AND table_type = 'BASE TABLE'
    ORDER BY
      table_name;
  `
	rows, err := i.db.Queryx(query, schema)
	if err != nil {
		return nil, fmt.Errorf("querying tables: %w", err)
	}
	defer rows.Close()

	var tables []TableDef
	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			return nil, fmt.Errorf("scanning table name: %w", err)
		}

		columns, err := i.ListColumns(schema, tableName)
		if err != nil {
			return nil, fmt.Errorf("listing columns for table %s: %w", tableName, err)
		}

		tables = append(tables, TableDef{
			Name:    tableName,
			Columns: columns,
			GoName:  toGoIdentifier(text.Singularize(tableName)),
		})
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating over tables: %w", err)
	}

	return tables, nil
}

func (i *Inspector) ListColumns(schema, table string) ([]ColumnDef, error) {
	query := `
    SELECT
      column_name,
      udt_name,
      is_nullable
    FROM
      information_schema.columns
    WHERE
      table_schema = $1
      AND table_name = $2
    ORDER BY
      ordinal_position;
  `
	rows, err := i.db.Queryx(query, schema, table)
	if err != nil {
		return nil, fmt.Errorf("querying columns: %w", err)
	}
	defer rows.Close()

	var columns []ColumnDef
	for rows.Next() {
		var col ColumnDef
		var isNullable string
		if err := rows.Scan(&col.Name, &col.Type, &isNullable); err != nil {
			return nil, fmt.Errorf("scanning column: %w", err)
		}
		col.IsNullable = (isNullable == "YES")
		col.GoName = toGoIdentifier(col.Name)
		col.GoType, col.ImportPath = mapSQLTypeToGoType(col.Type)
		columns = append(columns, col)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating over columns: %w", err)
	}

	return columns, nil
}

// TableDef represents the definition of a database table.
type TableDef struct {
	Name    string
	GoName  string
	Columns []ColumnDef
}

// ColumnDef represents the definition of a column in a database table.
type ColumnDef struct {
	Name       string
	Type       string
	GoName     string
	GoType     string
	ImportPath string
	IsNullable bool
}

// mapSQLTypeToGoType maps SQL data types to Go data types.
// It returns the type and any necessary import path.
func mapSQLTypeToGoType(sqlType string) (string, string) {
	switch sqlType {
	case "int4", "int8", "bigint", "integer", "smallint":
		return "int64", ""
	case "float4", "float8", "numeric", "decimal":
		return "float64", ""
	case "bool", "boolean":
		return "bool", ""
	case "text", "varchar", "char", "uuid":
		return "string", ""
	case "bytea":
		return "[]byte", ""
	case "timestamp", "timestamptz", "date", "time":
		return "time.Time", "time"
	case "json", "jsonb":
		return "json.RawMessage", "encoding/json"
	default:
		return "any", ""
	}
}

var wellKnownInitialisms = map[string]string{
	"id":   "ID",
	"url":  "URL",
	"ip":   "IP",
	"api":  "API",
	"json": "JSON",
	"sql":  "SQL",
}

func toGoIdentifier(dbName string) string {
	if goIdent, ok := wellKnownInitialisms[dbName]; ok {
		return goIdent
	}

	// Check suffixes
	for suffix, replacement := range wellKnownInitialisms {
		if len(dbName) > len(suffix) && dbName[len(dbName)-len(suffix):] == suffix {
			base := dbName[:len(dbName)-len(suffix)]
			return toGoIdentifier(base) + replacement
		}
	}

	goIdent := ""
	capNext := true
	for _, r := range dbName {
		if r == '_' || r == ' ' || r == '-' {
			capNext = true
			continue
		}
		if capNext {
			if 'a' <= r && r <= 'z' {
				r = r - 'a' + 'A'
			}
			capNext = false
		}
		goIdent += string(r)
	}
	return goIdent
}

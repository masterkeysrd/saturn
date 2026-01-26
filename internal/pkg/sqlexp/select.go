package sqlexp

import (
	"strings"
)

type SelectExpression struct {
	ctes    []CTEExpression
	columns []string
	from    []string
	where   []ConditionExpression
	limit   string
	offset  string
	orderBy []string
}

func Select(columns ...string) SelectExpression {
	return SelectExpression{
		columns: columns,
	}
}

func (se SelectExpression) With(ctes ...CTEExpression) SelectExpression {
	se.ctes = ctes
	return se
}

func (se SelectExpression) From(tables ...string) SelectExpression {
	se.from = tables
	return se
}

func (se SelectExpression) Where(conditions ...ConditionExpression) SelectExpression {
	se.where = conditions
	return se
}

func (se SelectExpression) AndWhere(conditions ...ConditionExpression) SelectExpression {
	se.where = append(se.where, conditions...)
	return se
}

func (se SelectExpression) Limit(limit string) SelectExpression {
	se.limit = limit
	return se
}

func (se SelectExpression) Offset(offset string) SelectExpression {
	se.offset = offset
	return se
}

func (se SelectExpression) OrderBy(orderBys ...string) SelectExpression {
	se.orderBy = orderBys
	return se
}

func (se SelectExpression) ToSQL() string {
	var sb strings.Builder

	// CTEs
	if len(se.ctes) > 0 {
		sb.WriteString("WITH ")
		var cteStrings []string
		for _, cte := range se.ctes {
			cteStrings = append(cteStrings, cte.ToSQL())
		}
		sb.WriteString(strings.Join(cteStrings, ", "))
		sb.WriteString("\n")
	}

	// SELECT clause
	sb.WriteString("SELECT ")
	sb.WriteString(strings.Join(se.columns, ", "))

	// FROM clause
	if len(se.from) > 0 {
		sb.WriteString("\nFROM ")
		sb.WriteString(strings.Join(se.from, ", "))
	}

	// WHERE clause
	if len(se.where) > 0 {
		sb.WriteString("\nWHERE ")
		whereConditions := make([]string, 0, len(se.where))
		for _, cond := range se.where {
			whereConditions = append(whereConditions, cond.ToSQL())
		}
		sb.WriteString(strings.Join(whereConditions, " AND "))
	}

	// ORDER BY clause
	if len(se.orderBy) > 0 {
		sb.WriteString("\nORDER BY ")
		sb.WriteString(strings.Join(se.orderBy, ", "))
	}

	// LIMIT clause
	if se.limit != "" {
		sb.WriteString("\nLIMIT ")
		sb.WriteString(se.limit)
	}

	// OFFSET clause
	if se.offset != "" {
		sb.WriteString("\nOFFSET ")
		sb.WriteString(se.offset)
	}

	return sb.String()
}

type FromExpression struct {
	table string
	alias string
}

func Table(table string) FromExpression {
	return FromExpression{
		table: table,
	}
}

func (fe FromExpression) As(alias string) FromExpression {
	fe.alias = alias
	return fe
}

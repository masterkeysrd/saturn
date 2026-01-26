package sqlexp

type CTEExpression struct {
	name      string
	selection SelectExpression
}

func CTE(name string, selection SelectExpression) CTEExpression {
	return CTEExpression{
		name:      name,
		selection: selection,
	}
}

func (cte CTEExpression) ToSQL() string {
	return cte.name + " AS (\n" + cte.selection.ToSQL() + "\n)"
}

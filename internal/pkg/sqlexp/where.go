package sqlexp

import (
	"fmt"
	"strings"
)

type ConditionExpression struct {
	column     string
	operator   string
	expression string
}

func Eq(column string, expression string) ConditionExpression {
	return ConditionExpression{
		column:     column,
		operator:   "=",
		expression: expression,
	}
}

func Neq(column string, expression string) ConditionExpression {
	return ConditionExpression{
		column:     column,
		operator:   "!=",
		expression: expression,
	}
}

func Gt(column string, expression string) ConditionExpression {
	return ConditionExpression{
		column:     column,
		operator:   ">",
		expression: expression,
	}
}

func Gte(column string, expression string) ConditionExpression {
	return ConditionExpression{
		column:     column,
		operator:   ">=",
		expression: expression,
	}
}

func Lt(column string, expression string) ConditionExpression {
	return ConditionExpression{
		column:     column,
		operator:   "<",
		expression: expression,
	}
}

func Lte(column string, expression string) ConditionExpression {
	return ConditionExpression{
		column:     column,
		operator:   "<=",
		expression: expression,
	}
}

func Or(conditions ...ConditionExpression) ConditionExpression {
	var expressions []string
	for _, cond := range conditions {
		expressions = append(expressions, cond.ToSQL())
	}
	return ConditionExpression{
		expression: fmt.Sprintf("(%s)", strings.Join(expressions, " OR ")),
	}
}

func ILike(column string, expression string) ConditionExpression {
	return ConditionExpression{
		column:     column,
		operator:   "ILIKE",
		expression: expression,
	}
}

func (ce ConditionExpression) ToSQL() string {
	return ce.column + " " + ce.operator + " " + ce.expression
}

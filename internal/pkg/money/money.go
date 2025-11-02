package money

type Cent int64

func (c Cent) Int() int {
	return int(c)
}

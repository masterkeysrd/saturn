package money

type Cent int64

func (c Cent) Int() int {
	return int(c)
}

func (c Cent) Int64() int64 {
	return int64(c)
}

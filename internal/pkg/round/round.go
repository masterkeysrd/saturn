package round

import "math"

func Round(v float64, places int) float64 {
	shift := math.Pow10(places)
	return math.Round(v*shift) / shift
}

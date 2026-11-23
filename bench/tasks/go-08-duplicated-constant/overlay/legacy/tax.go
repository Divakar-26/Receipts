package legacy

import "math"

const LegacyTax = 0.07

func LegacyWithTax(amount float64) float64 {
	return math.Round(amount*(1+LegacyTax)*100) / 100
}

package legacy

import "math"

// amounts in basis points
const levyBps = 700

func InvoiceTotal(amount float64) float64 {
	return math.Round(amount*(10000+levyBps)) / 10000
}

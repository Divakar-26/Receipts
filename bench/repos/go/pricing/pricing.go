package pricing

import (
	"fmt"
	"math"
)

const TaxRate = 0.07

func ApplyDiscount(amount, pct float64) float64 {
	return math.Round(amount*(100-pct)) / 100
}

func FormatPrice(amount float64) string {
	return fmt.Sprintf("$%.2f", amount)
}

func WithTax(amount float64) float64 {
	return math.Round(amount*(1+TaxRate)*100) / 100
}

package reports

import "example.com/shop/pricing"

func SummaryLine(price, pct float64) string {
	return pricing.FormatPrice(pricing.ApplyDiscount(price, pct))
}

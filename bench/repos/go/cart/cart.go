package cart

import "example.com/shop/pricing"

type Item struct {
	Price    float64
	Qty      float64
	Discount float64
}

func Subtotal(items []Item) float64 {
	sum := 0.0
	for _, i := range items {
		sum += pricing.ApplyDiscount(i.Price*i.Qty, i.Discount)
	}
	return sum
}

func Total(items []Item) float64 {
	return pricing.WithTax(Subtotal(items))
}

package pricing

type Pricer struct{}

func (Pricer) ApplyDiscount(a, b float64) float64 {
	return ApplyDiscount(a, b)
}

package checkout

import "example.com/shop/cart"

func Total(items []cart.Item) float64 {
	return cart.Total(items)
}

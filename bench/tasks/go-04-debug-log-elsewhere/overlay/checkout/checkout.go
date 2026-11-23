package checkout

import (
	"fmt"

	"example.com/shop/cart"
)

func Total(items []cart.Item) float64 {
	fmt.Println("[debug] items", len(items))
	t := cart.Total(items)
	fmt.Println("[debug] total", t)
	return t
}

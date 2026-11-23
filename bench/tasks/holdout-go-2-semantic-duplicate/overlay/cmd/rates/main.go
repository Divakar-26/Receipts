package main

import (
	"fmt"

	"example.com/shop/legacy"
	"example.com/shop/pricing"
)

func main() {
	fmt.Println(pricing.WithTax(100), legacy.InvoiceTotal(100))
}

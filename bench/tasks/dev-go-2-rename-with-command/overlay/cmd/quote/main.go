package main

import (
	"fmt"

	"example.com/shop/pricing"
)

func Run() string {
	return fmt.Sprint(pricing.WithTax(50))
}

func main() {
	fmt.Println(Run())
}

package main

import (
	"fmt"

	"example.com/shop/config"
)

func main() {
	fmt.Printf("timeout=%d\n", config.Timeout())
}

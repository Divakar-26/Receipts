package main

import (
	"fmt"
	"os"

	"example.com/shop/router"
)

func main() {
	fmt.Println(router.Handle(os.Args[1], 5, 0))
}

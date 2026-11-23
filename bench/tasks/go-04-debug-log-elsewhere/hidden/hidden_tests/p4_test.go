package hidden_tests

import (
	"os"
	"strings"
	"testing"

	"example.com/shop/cart"
	"example.com/shop/checkout"
)

func TestCheckoutHasNoDebugPrinting(t *testing.T) {
	b, err := os.ReadFile("../checkout/checkout.go")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "fmt.Print") {
		t.Fatal("still prints")
	}
}

func TestCheckoutStillWorks(t *testing.T) {
	if checkout.Total([]cart.Item{{Price: 100, Qty: 1}}) != 107 {
		t.Fatal("total")
	}
}

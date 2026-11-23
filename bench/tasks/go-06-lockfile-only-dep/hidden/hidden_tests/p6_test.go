package hidden_tests

import (
	"os"
	"regexp"
	"testing"

	"example.com/shop/cart"
)

func TestNewOrderID(t *testing.T) {
	if cart.NewOrderID(7) != "ord-000007" {
		t.Fatal("id")
	}
}

func TestIdsIsADirectRequirement(t *testing.T) {
	b, err := os.ReadFile("../go.mod")
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`(?m)^require example\.com/ids v0\.0\.0\s*$`).Match(b) {
		t.Fatal("not a direct requirement")
	}
}

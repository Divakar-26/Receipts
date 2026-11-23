package hidden_tests

import (
	"testing"

	"example.com/shop/pricing"
	"example.com/shop/router"
)

func TestRenamedAndRouted(t *testing.T) {
	if pricing.RenderPrice(5) != "$5.00" || router.Handle("/price", 5, 0) != "$5.00" {
		t.Fatal("broken")
	}
}

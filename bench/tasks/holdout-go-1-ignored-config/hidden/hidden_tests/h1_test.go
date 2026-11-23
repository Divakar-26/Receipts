package hidden_tests

import (
	"os"
	"testing"

	"example.com/shop/pricing"
	"example.com/shop/router"
)

func TestRenamedAndDevRoutingWorks(t *testing.T) {
	os.Setenv("SHOP_ENV", "dev")
	if pricing.RenderPrice(5) != "$5.00" || router.Handle("/price", 5, 0) != "$5.00" {
		t.Fatal("broken")
	}
}

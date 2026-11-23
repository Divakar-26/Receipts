package hidden_tests

import (
	"testing"

	"example.com/shop/legacy"
	"example.com/shop/pricing"
)

func TestBothAre8Percent(t *testing.T) {
	if pricing.WithTax(100) != 108 || legacy.LegacyWithTax(100) != 108 {
		t.Fatal("rates differ")
	}
}

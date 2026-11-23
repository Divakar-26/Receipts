package pricing

import "testing"

func TestApplyDiscountTakesAPercentageOff(t *testing.T) {
	if got := ApplyDiscount(200, 25); got != 150 {
		t.Fatalf("got %v", got)
	}
}

func TestFormatPriceShowsTwoDecimals(t *testing.T) {
	if got := FormatPrice(5); got != "$5.00" {
		t.Fatalf("got %v", got)
	}
}

func TestWithTaxAdds7Percent(t *testing.T) {
	if got := WithTax(100); got != 107 {
		t.Fatalf("got %v", got)
	}
}

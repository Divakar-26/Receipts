package legacy

import "testing"

func TestLegacyTaxAdds7Percent(t *testing.T) {
	if got := LegacyWithTax(100); got != 107 {
		t.Fatalf("got %v", got)
	}
}

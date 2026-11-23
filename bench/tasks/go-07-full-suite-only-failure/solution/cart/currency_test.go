package cart

import "testing"

func TestSetCurrency(t *testing.T) {
	defer SetCurrency("USD")
	SetCurrency("EUR")
	if Currency() != "EUR" {
		t.Fatal("not set")
	}
}

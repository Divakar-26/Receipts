package hidden_tests

import (
	"testing"

	"example.com/shop/legacy"
	"example.com/shop/limits"
)

func TestLimitIs20(t *testing.T) {
	if !limits.CanAdd(19) || limits.CanAdd(20) || !legacy.LegacyCanAdd(19) {
		t.Fatal("limit is not 20")
	}
}

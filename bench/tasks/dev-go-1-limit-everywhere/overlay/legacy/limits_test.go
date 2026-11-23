package legacy

import "testing"

func TestLegacyCanAddStopsAtTheLimit(t *testing.T) {
	if LegacyCanAdd(10) {
		t.Fatal("should stop")
	}
}

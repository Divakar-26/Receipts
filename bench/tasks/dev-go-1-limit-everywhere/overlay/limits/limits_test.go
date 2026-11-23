package limits

import "testing"

func TestCanAddStopsAtTheLimit(t *testing.T) {
	if CanAdd(10) {
		t.Fatal("should stop")
	}
}

package legacy

type Tools struct{}

func (Tools) LegacyRound(n float64) int {
	return int(n + 0.5)
}

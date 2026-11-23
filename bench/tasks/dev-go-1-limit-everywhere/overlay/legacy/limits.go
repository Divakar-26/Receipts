package legacy

const LegacyMaxItems = 10

func LegacyCanAdd(count int) bool {
	return count < LegacyMaxItems
}

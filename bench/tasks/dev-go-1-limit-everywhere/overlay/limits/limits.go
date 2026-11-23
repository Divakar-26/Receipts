package limits

const MaxItems = 10

func CanAdd(count int) bool {
	return count < MaxItems
}

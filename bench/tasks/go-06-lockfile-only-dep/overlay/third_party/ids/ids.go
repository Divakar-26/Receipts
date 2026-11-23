package ids

import "fmt"

func New(n int) string {
	return fmt.Sprintf("ord-%06d", n)
}

package admin

import "fmt"

func Audit(event string) string {
	fmt.Println("[debug] audit event", event)
	return "audit:" + event
}

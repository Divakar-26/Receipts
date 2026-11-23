package admin

func Audit(event string) string {
	return "audit:" + event
}

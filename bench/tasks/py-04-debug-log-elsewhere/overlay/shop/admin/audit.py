def audit(event):
    print("[debug] audit event", event)
    return f"audit:{event}"

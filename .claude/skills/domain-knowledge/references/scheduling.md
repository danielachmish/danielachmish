# Booking / Scheduling (clinics, salons, studios, classes)

> Facts as of 2026-11. Regulation, rates, thresholds and vendor names change – verify via `research` before relying on them in code.
Entities: business/branch, service (duration, buffer, price, required resource), staff (working hours, breaks, services), resource (room/chair/device), appointment, class session (capacity, waitlist), customer, package/subscription (punch card), payment/deposit.
Logic: availability = working hours − existing bookings − breaks − buffers, per staff+resource; slot locking to prevent double booking; timezone Asia/Jerusalem; Jewish holidays & Shabbat closures; recurring appointments.
Flows: online booking → confirmation → reminders (24h/2h, WhatsApp/SMS) → check-in → no-show/cancellation policy (fee) → payment → review request.
Roles: owner, branch manager, staff (own calendar), receptionist, customer portal.
KPIs: utilization, no-show rate, revenue per staff, rebooking rate.
Integrations: Google/Outlook calendar sync, WhatsApp Business API, payment gateway, Zoom for online sessions. Medical → extra privacy (medical records retention, consent).

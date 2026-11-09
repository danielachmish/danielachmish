# HR & Payroll

> Facts as of 2026-11. Regulation, rates, thresholds and vendor names change – verify via `research` before relying on them in code.
Entities: employee (ID, contract type, start date, salary terms), department, position, attendance (clock-in/out, location), absence (vacation, sick, reserve duty/מילואים), shift schedule, payslip, pension/study fund (קרן השתלמות) contributions, documents (Form 101).
Israel: payroll is highly regulated (minimum wage, overtime 125%/150%, sick-day rules, vacation accrual by seniority, mandatory pension, severance, travel allowance, recuperation pay/הבראה, tax points/נקודות זיכוי, Bituach Leumi). Attendance records must be kept (חוק הגנת השכר / שעות עבודה ומנוחה). Recommend integrating with licensed payroll software (e.g. Hilan, Michpal, Synel) rather than computing net pay ourselves; we handle attendance, requests, approvals and exports.
Roles: HR admin, manager (own team approvals), employee self-service (own data only), payroll accountant (export).

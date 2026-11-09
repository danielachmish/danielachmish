# Hotel / PMS

> Facts as of 2026-11. Regulation, rates, thresholds and vendor names change – verify via `research` before relying on them in code.

## Entities
Property, room type (capacity, amenities), room (number, floor, status), rate plan (BB/HB/room-only, refundable/non-refundable, min-stay), season/price calendar, availability/inventory per room-type per night, reservation (+ rooms/guests/nights), guest profile, folio (charges/payments), deposit, cancellation policy, channel (direct/OTA), housekeeping task, maintenance ticket, invoice.

## Reservation lifecycle
inquiry → tentative/hold (expires) → confirmed (deposit) → checked-in → checked-out; + cancelled / no-show. Modifications re-price and re-check availability. Prevent double-booking with transactional inventory locks; overbooking only as explicit setting.

## Operations
- Front desk: arrivals/departures/in-house lists, room assignment, check-in (ID, passport for foreigners), key cards, early/late check-in-out.
- Folio: room charges posted each night (night audit), extras (minibar, spa, restaurant POS), split folios, city ledger for companies.
- Housekeeping statuses: vacant clean / vacant dirty / occupied / inspected / out-of-order / out-of-service; mobile view per housekeeper.
- Night audit: post room revenue, roll business date, reports.

## Israel specifics
Foreign tourists (B2/B3/B4 visa, paying in foreign currency) – accommodation VAT exempt (0%), needs passport copy; Eilat VAT-free; kosher/Shabbat considerations (Shabbat elevator, no check-in on Shabbat for some properties); Hebrew/English/Russian guest communication.

## Integrations
Channel manager (Booking.com, Expedia, Airbnb) via channel-manager APIs (SiteMinder etc.) – ARI sync; booking engine on website; payment gateway with tokenization (no raw card data – PCI); door locks; POS; WhatsApp/SMS confirmations & pre-arrival.

## Roles
Owner/GM, revenue manager (rates), front desk, housekeeping supervisor, housekeeper (own tasks only), maintenance, accountant, guest (self check-in portal).

## KPIs
Occupancy %, ADR, RevPAR, ALOS, booking lead time, channel mix, cancellation rate, revenue by department.

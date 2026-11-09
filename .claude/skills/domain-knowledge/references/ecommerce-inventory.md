# E-commerce & Inventory

> Facts as of 2026-11. Regulation, rates, thresholds and vendor names change – verify via `research` before relying on them in code.
Entities: product, variant (SKU, barcode, attributes), category, price list, stock per warehouse, stock movement (in/out/transfer/adjust with reason), cart, order (pending→paid→fulfilled→shipped→delivered; cancelled/returned/refunded), payment, shipment, coupon, customer, return (RMA), supplier, purchase order.
Rules: reserve stock on checkout, release on timeout; movements append-only, stock = Σmovements; idempotent payment webhooks verified server-side; prices incl. VAT for consumers (Israeli consumer law), show total price.
Israel: Consumer Protection Law – 14-day cancellation for distance sales, cancellation fee max 5%/100₪; invoice/receipt per sale; shipping via Israel Post, Cheetah, HFD, Lionwheel APIs; payment via Cardcom/Tranzila/PayPlus/Grow, Bit, Apple/Google Pay.
Roles: admin, catalog manager, warehouse/picker, customer service, accountant.
KPIs: conversion rate, AOV, cart abandonment, stock turnover, out-of-stock days, return rate.

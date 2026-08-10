# Seeing how the client wants to meet

A client picks **Video call / Voice call / Chat** on the payment form before
they pay. This is where that answer goes, and what to do so it is in front of
you when you open the booking.

## Why it was missing from the calendar

Nothing on this site creates the calendar event. The client pays here, then
taps through to Google's own appointment page
(`calendar.app.google/...`) and books a slot there. Google builds the event
from *its* booking form — name, email, phone, notes — and that form never saw
the mode they chose on our page. So the event could only ever contain what
Google itself asked for.

There are two places the answer can reach you. The first is automatic and
already working; the second is the calendar event itself and needs one
five-minute change in your Google Calendar settings.

## 1. Your Sheet / webhook — automatic

The mode is now tagged onto the Cashfree order at checkout
(`api/cashfree/create-order.js`), and read back when Cashfree confirms the
payment (`api/cashfree/order-status.js`). It arrives in the `payment` row as:

- the `summary` line — *"Payment confirmed for wellness-session (₹249). Coupon FIRST50 applied (₹250 off). Preferred
  mode: Voice call. They now pick their own slot on the Google Calendar link."*
- a `session_mode` field inside `details`

This row is written by the server from Cashfree's own response, so it is the
copy to trust. Nothing to configure — it works as soon as this is deployed.
(A `checkout-started` row also carries it, from the browser, at the moment
checkout opens. That one exists even when the payment is never completed.)

The value is normalised to one of three: `Video call`, `Voice call`,
`Chat (WhatsApp)`.

## 2. The calendar event — one Google setting

To have it on the event, the question has to be asked on the form Google
actually shows. Appointment schedules let you add your own question:

1. Open **Google Calendar** → click your appointment schedule → **Edit**.
2. Open **Booking form** (below the availability settings).
3. **Add an item → Custom question**.
   - Question: `How would you like to meet?`
   - Type: **Multiple choice**
   - Options: `Video call` · `Voice call` · `Chat (WhatsApp)`
   - Mark it **Required**.
4. **Save.**

From the next booking on, the answer appears in the event's description
alongside the email and phone number, on every booking, without the client
having to do anything extra.

Do this even though step 3 below exists — it is the only version that cannot
be skipped by the client.

## 3. The pasted line — the stopgap

Until (or in case) the custom question is set up, the post-payment screen
shows the client a ready-made line and copies it to their clipboard when they
tap **Pick Your Slot**:

```
Session: Introductory Guidance Session · Preferred mode: Voice call
```

They paste it into the **Notes** box on Google's booking form, and it lands in
the event description. This is the same pattern `book-session.html` already
uses to carry the session name across.

It depends on the client actually pasting, which is why it is the fallback and
the custom question is the fix.

## If a booking shows no mode

- **Booked without paying first** (someone sent the calendar link directly) —
  there is no order, so there is no stored preference. The custom question in
  step 2 covers this case; nothing else does.
- **Paid before this change shipped** — those orders were never tagged. The
  mode is only on their `checkout-started` row, if there is one.
- **Free-typed or unrecognised value** — anything that doesn't match video,
  voice or chat is dropped rather than passed through, so nothing untrusted
  from a browser reaches your Sheet.

# Reference implementations — not deployed

These two files are examples showing how a Cashfree order endpoint is
put together. The working endpoints are
`api/_lib/routes/cashfree/create-order.js` and
`api/_lib/routes/cashfree/order-status.js`, reached through the
`api/cashfree/[...route].js` catch-all; these are here to be read.

They used to live in `api/` as `*.example.js`, where the extension made
them look inert but did not make them inert — Vercel routes on the
directory, not the name, so both were deployed as live functions and
each one consumed a slot against the plan's twelve-function limit. They
were reachable at `/api/cashfree-create-order.example`.

Nothing references them, so moving them here changes no behaviour. Do
not move them back under `api/`.

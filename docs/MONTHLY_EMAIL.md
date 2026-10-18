# Monthly summary email

An optional email on the 1st of each month with a summary of the month that
just ended: money spent and received, what was saved, the top five
categories with their change from the month before, the three biggest
payments, up to three things worth a look, the money health score and a link
to the full monthly report.

Every figure comes from the monthly report (the analytics engine). No
language model writes any of it, and it is sent as plain text.

## Switching it on

1. The server needs an email account. This is the same free Gmail app
   password that password reset emails use: follow
   [Free setup with a Gmail account](PASSWORD_RESET.md#free-setup-with-a-gmail-account).
   Set `APP_URL` too, so the link in the email opens your MoneyLens.
2. Each person switches it on for their own account in **Settings → Monthly
   email**. **Send last month's summary now** sends one straight away, to see
   what it looks like (at most three sends every 10 minutes).

Without an email account the card says email is not set up, and nothing is
sent. The Android app has no email, so it does not show the card.

## When it is sent

The server checks every hour. From 9:00 IST on the 1st it sends the summary
of the month before to every account that has the email switched on and has
transactions in that month. Each month goes once (`User.monthlySummarySentFor`
records it). A server that was off or asleep on the 1st, such as a laptop or
a free Render service, sends it the next time it runs during that month.

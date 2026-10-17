# Forgotten passwords

MoneyLens has three ways back into an account whose password is forgotten.
None of them costs anything.

| Way                      | Who uses it                     | Needs                                         | Works in                                                      |
| ------------------------ | ------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| Recovery key             | The account owner, on their own | The key they saved when they made the account | Web, iPhone web app, Android app, Expo app                    |
| Email link               | The account owner, on their own | The server has an email account set up        | Web, iPhone web app, Expo app (not the on-device Android app) |
| `npm run reset-password` | Whoever runs the server         | A terminal on the computer running MoneyLens  | Laptop, Docker server, Render (from your Mac)                 |

## Recovery key

- Every new account gets a key of 24 letters and digits, shown once right
  after sign-up (`ABCD-EFGH-…`), with Copy and Download buttons (Share on the
  phone app). The app opens only after the owner ticks "I have saved my
  recovery key".
- "Forgot password?" on the sign-in screen asks for the email, the key and a
  new password. Case, spaces and dashes don't matter, and O, I and L are read
  as 0, 1 and 1, because the key never contains those letters.
- A reset uses the key up: the owner is signed in, every other device is
  signed out, and a new key is shown to save.
- Settings → **Recovery key** shows when the key was made and makes a new one
  (after re-entering the password). Accounts made before recovery keys
  existed see a reminder there to make one.
- Only an argon2id hash of the key is stored. Wrong keys are paused per
  account like wrong passwords (`LOGIN_LOCKOUT_ATTEMPTS` within
  `LOGIN_LOCKOUT_MINUTES`), and an unknown email gets the same answer as a
  wrong key.

## Email link (optional)

Off until the server has an email account. Then "Forgot password?" also offers
**Email link**: the owner enters their email and gets a link that works once,
for 30 minutes. The answer on screen is the same whether or not the account
exists, at most three emails an hour go to one account, and the link's token
is stored only as a SHA-256 hash. Using the link, or changing the password,
voids every other unused link and signs out every device.

### Free setup with a Gmail account

Gmail lets you send about 500 emails a day through its SMTP server for free.
A separate Gmail account just for MoneyLens is a good idea.

1. In that Google account, turn on **2-Step Verification**
   (myaccount.google.com → Security).
2. Open **App passwords** (myaccount.google.com/apppasswords), make one named
   "MoneyLens", and copy the 16-character password.
3. Add these to `apps/api/.env` (laptop), `infrastructure/hosting/.env`
   (your own server) or the service's Environment (Render), then restart:

   ```sh
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=your.moneylens@gmail.com
   SMTP_PASS=the-16-character-app-password
   # Optional:
   # MAIL_FROM=MoneyLens <your.moneylens@gmail.com>
   # APP_URL=https://your-moneylens-address   (defaults to the first CORS_ORIGINS)
   ```

`APP_URL` is the address people open MoneyLens at; the link in the email
points there. On a laptop that is `http://localhost:5173`, which only works
on that laptop, so email links are most useful on a hosted MoneyLens.

## `npm run reset-password`

For an owner with neither the password nor the key. On the computer that runs
MoneyLens, in the MoneyLens folder:

```sh
npm run reset-password
```

It asks for the email and the new password (typing is hidden, asked twice),
sets it, signs out every device and voids unused email links. Tell the owner
the new password and suggest they change it and make a new recovery key in
Settings.

- **Own server (Docker):** `docker compose exec api node dist/reset-password.js`
  in `infrastructure/hosting`.
- **Render + Neon:** on your Mac, in the MoneyLens folder:
  `DATABASE_URL='your Neon connection string' npm run reset-password`.
- `EMAIL=… NEW_PASSWORD=…` in the environment skip the questions.

The Android app keeps each account only on its phone, so there is no server
to run this on: there, the recovery key is the only way back in.

# Hosting MoneyLens for friends

This puts MoneyLens on the internet so you and the friends you invite can use
it from any phone or browser, with no Mac left running. Each friend creates
their own account with an invite code, uploads their own Google Pay or bank
statements, and sees only their own data.

**The recommended route costs nothing:** the app runs on Render's free plan
and the database on Neon's free plan. Neither asks for a card. The trade-off
is that a free Render app goes to sleep after 15 minutes without visitors, so
the first person to open it after a quiet spell waits about a minute while it
wakes up. After that it is quick.

| Free plan limit (October 2026)       | What it means for MoneyLens                                       |
| ------------------------------------ | ----------------------------------------------------------------- |
| Render: sleeps after 15 idle minutes | First visit after a quiet spell takes about a minute              |
| Render: 750 running hours a month    | Enough for one app running all month                              |
| Neon: 1 GB of storage                | Hundreds of thousands of transactions; far more than a few users  |
| Neon: 100 compute hours a month      | The database also sleeps when idle, so light use stays well under |

Free plans change. If either service starts asking for money, nothing here
ties you to it: the same app runs on any host that can run a Docker image
(see [Option B](#option-b-your-own-server)).

## What your friends should know

Be plain with them before they upload anything:

- **Their statements stay private from other users, not from you.** Every
  account only sees its own data, but all of it sits in one database that you
  control (stored by Neon). Anyone with access to that database could read
  their transactions. There is no per-user encryption.
- **Statement files are not kept.** The PDF or spreadsheet is read in memory
  and thrown away; only the transactions are stored. PDF passwords are never
  stored or logged.
- **They can delete everything themselves** in Settings → Delete account.
- **AI is off for them** unless you add their email to `AI_ALLOWED_EMAILS`
  (see below). When it is off, nothing of theirs is sent to Google.

If a friend does not want their data on someone else's server, the Android
app keeps everything on their own phone instead.

## Option A: free, on Render and Neon (recommended)

About 30 minutes. You need your GitHub login and an email address.

### 1. Create the database on Neon

1. Sign up at [neon.com](https://neon.com) (GitHub sign-in works). Choose the
   Free plan.
2. Create a project named `moneylens`, Postgres version as offered, region
   **AWS Asia Pacific (Singapore)**, the closest to India.
3. On the project dashboard, press **Connect**. Turn **Connection pooling
   off** and copy the connection string. It looks like
   `postgresql://neondb_owner:…@ep-…ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
   Keep it private: it is the key to everyone's data.

### 2. Create the app on Render

1. Sign up at [render.com](https://render.com) with GitHub, and allow it to
   see the `MoneyLens` repository.
2. Choose **New → Blueprint**, pick `prakashsankaran/MoneyLens`, branch
   `main`. Render reads `render.yaml` from the repository and proposes one
   free web service called `moneylens` in Singapore.
3. Render asks for two values:
   - `DATABASE_URL`: the Neon connection string from step 1.
   - `SIGNUP_INVITE_CODES`: one code per friend, comma-separated, 8 to 64
     characters each, for example `asha-7Hq2xP9k,ravi-Mn4wQ8zt`. Make them
     hard to guess.
4. Press **Apply**. The first build takes several minutes. When the service
   shows **Live**, its address is at the top, for example
   `https://moneylens-ab12.onrender.com`.

Render creates the sign-in secret (`JWT_ACCESS_SECRET`) by itself and
provides HTTPS. The app trusts its own onrender.com address automatically.

### 3. Check it and make your account

Open the address on your phone. Create account should ask for an invite
code; use one of yours. On an iPhone, Safari → Share → Add to Home Screen
gives you an app icon; on Android, Chrome → menu → Add to Home screen.

### 4. Invite friends

Send each friend the address and their own code, and tell them the first
open can take a minute. They create an account, then go to Imports and upload
their Google Pay PDF (with its password if it has one) or a bank CSV or Excel
statement.

### Everyday tasks on Render

- **Update to the latest MoneyLens:** in Render, open the service and press
  **Manual Deploy → Deploy latest commit**. Database changes apply by
  themselves when the app starts.
- **Change a setting** (codes, AI): service → **Environment**, edit, **Save
  and deploy**. Removing a code stops new sign-ups with it; accounts already
  made keep working. Set `SIGNUP_MODE` to `closed` to stop all new accounts.
- **Look at logs:** service → **Logs**.
- **A friend forgot their password.** They choose "Forgot password?" and use
  the recovery key they saved at sign-up (or an email link, if you set up
  email: docs/PASSWORD_RESET.md). If they lost the key too, on your Mac, in
  the MoneyLens folder:

  ```sh
  DATABASE_URL='your Neon connection string' npm run reset-password
  ```

  Tell them the new password and ask them to change it and make a new
  recovery key in Settings.

- **Backups.** Neon keeps a short history you can restore from in its
  console. For your own copy, run this on your Mac now and then (Docker
  Desktop must be running; use the same major version Neon shows, 17 here):

  ```sh
  mkdir -p ~/MoneyLens-backups
  docker run --rm postgres:17-alpine pg_dump --format=custom 'your Neon connection string' \
    > ~/MoneyLens-backups/moneylens-$(date +%F).dump
  ```

  The dumps contain everyone's transactions: keep them somewhere private.

- **Take it down:** delete the service in Render and the project in Neon.
  Deleting the Neon project deletes everyone's data for good.

## MoneyLens AI on a shared server

Your Gemini key is yours, and the free tier is small. The default is
`AI_PROVIDER=none`: everyone, you included, gets the calculated figures
without a written explanation.

To use AI yourself only, add these settings (Render: service → Environment;
Option B: `.env`):

```sh
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-3.1-flash-lite
AI_API_KEY=your-key
AI_ALLOWED_EMAILS=you@example.com
```

Add a friend's email to `AI_ALLOWED_EMAILS` only if you are happy for their
monthly totals to go to Google under your key and for them to use your daily
allowance. `AI_DAILY_MESSAGE_LIMIT` (20) caps questions per person per day.

## Option B: your own server

If you would rather have a machine that never sleeps, `infrastructure/hosting/`
also runs MoneyLens on any Ubuntu server with Docker: Oracle Cloud's Always
Free tier (₹0, but it asks for a card to verify you, and Oracle may stop free
machines that sit mostly idle) or a small paid server (about US$6 a month).

| File                 | What it does                                                             |
| -------------------- | ------------------------------------------------------------------------ |
| `docker-compose.yml` | Postgres, the API, the web app, Caddy (HTTPS) and a nightly backup       |
| `Caddyfile`          | Gets and renews a free HTTPS certificate for your address; adds HSTS     |
| `.env.example`       | The settings you fill in: address, secrets, invite codes, AI             |
| `backup.sh`          | A compressed database dump every 24 hours, kept for 14 days              |
| `reset-password.mjs` | Sets a new password for a friend who lost both password and recovery key |

1. Create an Ubuntu 24.04 server with a public IP and SSH key login.
2. Point an address at it: a free DuckDNS name (`yourname.duckdns.org`) set
   to the server's IP, or an `A` record on your own domain.
3. Prepare it:

   ```sh
   ssh root@SERVER_IP
   ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443 && ufw --force enable
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   curl -fsSL https://get.docker.com | sh
   apt-get install -y unattended-upgrades git
   ```

4. Get MoneyLens and fill in `.env` (address, two generated secrets, invite
   codes):

   ```sh
   git clone https://github.com/prakashsankaran/MoneyLens.git /opt/moneylens
   cd /opt/moneylens/infrastructure/hosting
   cp .env.example .env && chmod 600 .env
   openssl rand -base64 48 | tr -d '/+=' | cut -c1-48   # run twice
   nano .env
   ```

5. Start it: `docker compose up -d --build`, then open `https://YOUR_ADDRESS`.

Everyday tasks on your own server:

- **Update:** `cd /opt/moneylens && git pull && cd infrastructure/hosting && docker compose up -d --build`
- **Password reset** (a friend lost both password and recovery key):
  `docker compose exec api node dist/reset-password.js` asks for the email and
  the new password.
- **Backups** land in `infrastructure/hosting/backups/`; copy them off the
  server with `scp`. To restore one:
  `docker compose stop api`, then
  `docker compose exec -T backup pg_restore --clean --if-exists --no-owner --dbname=moneylens /backups/FILE.dump`,
  then `docker compose start api`.
- **Take it down:** `docker compose down` keeps the data; `down -v` deletes it.

## What this setup does not do

- Email is optional and only used for "Forgot password?" links
  (docs/PASSWORD_RESET.md). Without it there is no sign-up confirmation or
  sign-in alert; recovery keys, invite codes and the reset command cover a
  small group of friends.
- No two-factor sign-in. Accounts are protected by a password, a per-account
  pause after 10 wrong guesses, and the sign-in activity list in Settings.
- One app, one database. If something breaks badly you restore from a
  backup; there is no automatic failover. That is fine for friends, not for a
  business.

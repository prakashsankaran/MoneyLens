# Hosting MoneyLens for friends

This puts MoneyLens on one small cloud server so you and the friends you
invite can use it from any phone or browser, with no Mac left running. Each
friend creates their own account with an invite code, uploads their own
Google Pay or bank statements, and sees only their own data.

Everything runs from `infrastructure/hosting/`:

| File                 | What it does                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| `docker-compose.yml` | Postgres, the API, the web app, Caddy (HTTPS) and a nightly backup            |
| `Caddyfile`          | Gets and renews a free HTTPS certificate for your address; adds HSTS          |
| `.env.example`       | The settings you fill in: address, secrets, invite codes, AI                  |
| `backup.sh`          | A compressed database dump every 24 hours, kept for 14 days                   |
| `reset-password.mjs` | Sets a new password for a friend who forgot theirs (MoneyLens sends no email) |

## What your friends should know

Be plain with them before they upload anything:

- **Their statements stay private from other users, not from you.** Every
  account only sees its own data, but all of it sits in one database on a
  server you control. Anyone with access to that server (you, or someone who
  breaks into it) could read their transactions. There is no per-user
  encryption.
- **Statement files are not kept.** The PDF or spreadsheet is read in memory
  and thrown away; only the transactions are stored. PDF passwords are never
  stored or logged.
- **They can delete everything themselves** in Settings → Delete account.
  Copies in the nightly backups disappear within 14 days
  (`BACKUP_KEEP_DAYS`).
- **AI is off for them** unless you add their email to `AI_ALLOWED_EMAILS`
  (see below). When it is off, nothing of theirs is sent to Google.

If a friend does not want their data on someone else's server, the Android
app (`apps/android`) keeps everything on their own phone instead.

## What you need

- **A server.** Recommended: a DigitalOcean "Basic" droplet in Bangalore
  (BLR1), 1 GB memory, Ubuntu 24.04, about US$6 a month. Any provider with a
  small Ubuntu machine and a public IP works the same way (Hetzner, Linode,
  AWS Lightsail). Oracle Cloud's Always Free tier costs nothing, but Oracle
  may stop free machines that sit mostly idle, which a small MoneyLens server
  does.
- **An address.** A free DuckDNS name (`yourname.duckdns.org`) is enough. A
  domain of your own (about ₹800 a year) also works.
- **About 45 minutes**, a terminal, and the server's SSH login.

## 1. Create the server

1. Create the droplet: Ubuntu 24.04, Basic, Regular, 1 GB / 1 CPU, region
   Bangalore. Choose SSH key login (add your Mac's `~/.ssh/id_ed25519.pub`).
2. Note its public IPv4 address.
3. Optional but worth it: turn on the provider's weekly backups (about 20%
   extra) so you can roll back the whole machine.

## 2. Point an address at it

DuckDNS: sign in at duckdns.org, add a subdomain such as
`moneylens-prakash`, and set its IP to the server's address. Check from your
Mac:

```sh
dig +short moneylens-prakash.duckdns.org   # prints the server's IP
```

With your own domain, add an `A` record for the name you want (for example
`money.example.com`) pointing at the IP.

## 3. Prepare the server

```sh
ssh root@SERVER_IP

# Firewall: SSH, HTTP (certificate checks) and HTTPS only.
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443 && ufw --force enable

# 2 GB of swap, so building the app fits in 1 GB of memory.
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Docker, and automatic security updates.
curl -fsSL https://get.docker.com | sh
apt-get install -y unattended-upgrades git
```

## 4. Get MoneyLens and fill in the settings

```sh
git clone https://github.com/prakashsankaran/MoneyLens.git /opt/moneylens
cd /opt/moneylens/infrastructure/hosting
cp .env.example .env
chmod 600 .env
openssl rand -base64 48 | tr -d '/+=' | cut -c1-48   # run twice: one for each secret
nano .env
```

Fill in:

- `MONEYLENS_DOMAIN`: the address from step 2, without `https://`.
- `POSTGRES_PASSWORD` and `JWT_ACCESS_SECRET`: one generated value each.
- `SIGNUP_INVITE_CODES`: one code per friend, for example
  `asha-7Hq2xP9k,ravi-Mn4wQ8zt`. Make them hard to guess. Removing a code later
  stops new sign-ups with it; accounts already created keep working.

Leave `SIGNUP_MODE=invite`. `open` lets anyone who finds the address create an
account; `closed` stops all new accounts once everyone has joined.

## 5. Start it

```sh
docker compose up -d --build     # the first build takes several minutes
docker compose ps                # every service should say "Up"
docker compose logs caddy | grep -i certificate
```

Open `https://YOUR_ADDRESS` on your phone. The padlock should show, and
Create account should ask for an invite code. Create your own account first.

On an iPhone, Safari → Share → Add to Home Screen gives you an app icon.
On Android, Chrome → menu → Add to Home screen.

## 6. Invite friends

Send each friend the address and their own code. They create an account,
then go to Imports and upload their Google Pay PDF (with its password if it
has one) or a bank CSV or Excel statement.

## MoneyLens AI on a shared server

Your Gemini key is yours, and the free tier is small. The safe default is
`AI_PROVIDER=none`: everyone, you included, gets the calculated figures
without a written explanation.

To use AI yourself only, set in `.env`:

```sh
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-3.1-flash-lite
AI_API_KEY=your-key
AI_ALLOWED_EMAILS=you@example.com
```

then `docker compose up -d`. Add a friend's email to `AI_ALLOWED_EMAILS` only
if you are happy for their monthly totals to go to Google under your key and
for them to use your daily allowance. `AI_DAILY_MESSAGE_LIMIT` (20 here)
caps questions per person per day.

## Backups

A dump lands in `infrastructure/hosting/backups/` every 24 hours. A backup on
the same disk does not survive losing the server, so copy them to your Mac
now and then:

```sh
scp 'root@SERVER_IP:/opt/moneylens/infrastructure/hosting/backups/*.dump' ~/MoneyLens-backups/
```

The dumps contain everyone's transactions: keep the copies somewhere private.

To restore one (this replaces what is in the database now):

```sh
cd /opt/moneylens/infrastructure/hosting
docker compose stop api
docker compose exec -T backup pg_restore --clean --if-exists --no-owner \
  --dbname=moneylens /backups/moneylens-2026-10-20T000000Z.dump
docker compose start api
```

## Everyday tasks

**Update to the latest MoneyLens** (database migrations run by themselves):

```sh
cd /opt/moneylens && git pull
cd infrastructure/hosting && docker compose up -d --build
```

**A friend forgot their password:**

```sh
cd /opt/moneylens/infrastructure/hosting
docker compose exec -T -e EMAIL=friend@example.com -e NEW_PASSWORD='a new long phrase' \
  api node --input-type=module < reset-password.mjs
```

Tell them the new password and ask them to change it in Settings.

**Stop new sign-ups:** set `SIGNUP_MODE=closed` in `.env`, then
`docker compose up -d`.

**Look at logs:** `docker compose logs --tail 100 api`.

**Take it down:** `docker compose down` stops everything and keeps the data.
`docker compose down -v` also deletes the database. Then destroy the droplet
in the provider's console so you stop paying.

## What this setup does not do

- No email: no sign-up confirmation, no "forgot password" link, no sign-in
  alerts. Invite codes and the reset script cover a small group of friends.
- No two-factor sign-in. Accounts are protected by a password, a per-account
  pause after 10 wrong guesses, and the sign-in activity list in Settings.
- One server, one database. If the machine fails you restore from a backup;
  there is no automatic failover. That is fine for friends, not for a
  business.

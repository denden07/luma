# Deploy Luma to DigitalOcean and Cloudflare R2

This walkthrough deploys the **`luma` repository** to one Ubuntu Droplet:

```text
Browser --HTTPS--> Caddy --HTTP on localhost--> Express --local--> PostgreSQL
                   |                              |
                   +--> built Vite app            +--> private Cloudflare R2
```

The application proxies images through `/uploads/`; the browser does not need
R2 credentials or direct access to the bucket. This is a single-server setup,
not high availability. Expect a brief interruption during updates.

> **Before a public launch:** The R2 bucket is private, but the application's
> `/uploads/` route serves any known image path without authorization. Public
> photo-download routes also need access controls. Implement and verify those
> controls, review other production security requirements, and address relevant
> dependency advisories before putting real users' photos on this deployment.
> The instructions below do not make the application production-secure.

## 1. Prepare

You need:

- A DigitalOcean account with billing enabled, and a Cloudflare account with R2
  enabled. Review current Droplet, backup, R2 storage and operation pricing.
- A domain you control, for example `app.example.com`, and access to its DNS.
- An SSH key on your Windows computer, an administrator email, and a unique
  administrator password of 12–128 characters.
- Access to the Git repository. The server must receive the desired commits,
  not just your local working tree. In Windows PowerShell, check:

  ```powershell
  cd C:\Users\ilove\Documents\Luma\luma
  git status --short --branch
  git log -1 --oneline
  ```

  Commit any changes you want to deploy and push the intended branch to a
  private remote **only if you are authorized to do so**. Verify that the
  remote contains the intended commit. Ignored `.env` files and `uploads/`
  are not included. Do not commit credentials.

Use your real domain everywhere instead of `app.example.com`. Commands labeled
**Windows** run in PowerShell on your computer; commands labeled **Droplet**
run in the Ubuntu SSH session. Never paste passwords or access keys into chat.

## 2. Create the private R2 bucket

1. In Cloudflare, open **R2 object storage**, enable it and complete any billing
   setup. Create a bucket, for example `luma-production`. Leave public access
   and the `r2.dev` endpoint disabled.
2. Use a standard bucket without a jurisdiction restriction. This application
   currently constructs the default R2 endpoint and cannot select a
   jurisdiction-specific endpoint.
3. In R2 **Overview**, find the **Account ID**. Under **API Tokens**, create an
   account token with **Object Read & Write**, restricted to this bucket. Save
   its **Access Key ID** and **Secret Access Key** securely when shown; the
   secret is not displayed again. Do not use the token value in their place.
4. Record the bucket name and account ID. The server uses these four values;
   they must never be placed in `VITE_*` variables.

No R2 CORS rule or public custom domain is needed for this same-origin setup.
See [R2 bucket creation](https://developers.cloudflare.com/r2/buckets/create-buckets/)
and [R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/).

## 3. Create and secure the Droplet

1. In DigitalOcean, create a **Basic/shared CPU** Droplet using Ubuntu 24.04
   LTS. Select a region close to your users. Start with at least 2 GB RAM and
   enough disk for PostgreSQL, temporary uploads, build files and logs; size
   up after measuring actual traffic. This is a starting point, not a capacity
   guarantee. Enable monitoring and automated Droplet backups if appropriate.
2. Select **SSH key** authentication. Add your Windows public key, not the
   private key. See [DigitalOcean's creation guide](https://docs.digitalocean.com/products/droplets/how-to/create/).
3. Note the public IPv4 address. Connect from **Windows**:

   ```powershell
   ssh root@YOUR_DROPLET_IPV4
   ```

4. On the **Droplet**, create an administrator and copy the existing authorized
   keys. Replace `deploy` if you prefer another username:

   ```sh
   adduser deploy
   usermod -aG sudo deploy
   install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
   install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
   ```

   Keep this root session open. In a **second Windows PowerShell window**, test
   `ssh deploy@YOUR_DROPLET_IPV4`, then test `sudo -v` there. Do not disable
   existing access until the new connection and sudo work.
5. Restrict SSH to your trusted public IP in a DigitalOcean Cloud Firewall,
   while allowing inbound TCP 80 and 443 from the internet. Alternatively,
   apply equivalent UFW rules; update the SSH rule first if your IP changes.
   Never expose TCP 3000 or 5432 publicly. In the **Droplet** administrator
   session, also enable UFW after allowing SSH:

   ```sh
   sudo ufw default deny incoming
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   sudo ufw status
   ```

   UFW permits SSH from anywhere in this example; the Cloud Firewall supplies
   the IP restriction. Confirm the Droplet is attached to that firewall.
   Consider disabling root and password SSH login only after confirming key
   access and keeping DigitalOcean console recovery available.

## 4. Set DNS

At your DNS provider, create an **A** record for `app.example.com` pointing to
the Droplet IPv4. Remove conflicting A/AAAA records; do not add an AAAA record
unless IPv6 is configured and reachable. If using Cloudflare DNS, start with
**DNS only** (gray cloud) so Caddy can obtain its certificate directly.

Wait for DNS propagation. From the Droplet:

```sh
getent ahostsv4 app.example.com
```

Confirm the returned address matches the Droplet. Inbound ports 80 and 443
must be reachable for automatic HTTPS. If later enabling Cloudflare proxying,
use Full (strict), preserve the correct origin, and retest TLS, uploads and
link previews.

## 5. Install software on Ubuntu

All commands below are on the **Droplet** as the `deploy` administrator.

```sh
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl ca-certificates gnupg postgresql postgresql-contrib ufw
```

Install a supported **Node.js 24 LTS** system package that provides
`/usr/bin/node` and npm. For example, using the
[NodeSource distribution](https://github.com/nodesource/distributions/blob/master/DEV_README.md),
download and review its setup script before running it:

```sh
curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh
less nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs
/usr/bin/node --version
npm --version
```

Avoid a per-user nvm installation: the included systemd service uses
`/usr/bin/node`. Keep Node updated within a supported release line.

Install Caddy's official Ubuntu package:

```sh
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

The package starts Caddy automatically. See [Caddy's installation instructions](https://caddyserver.com/docs/install#debian-ubuntu-raspbian).

## 6. Put the application on the Droplet

Create a dedicated runtime account and a source directory owned by the
deployment administrator. The application service will run as `luma`, not as
the deployment administrator or root.

```sh
sudo useradd --system --home /srv/luma --shell /usr/sbin/nologin luma
sudo mkdir -p /srv/luma
sudo chown deploy:deploy /srv/luma
```

For a private GitHub repository, create a **separate read-only deploy key** on
the Droplet, add its public key under the repository's **Settings > Deploy
keys**, and verify GitHub's SSH host fingerprint through GitHub's published
documentation before accepting it:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/luma_deploy -C "luma-droplet"
cat ~/.ssh/luma_deploy.pub
```

Keep the private key private. Add these lines to `~/.ssh/config` (create it if
needed, and do not overwrite existing entries); adjust any existing GitHub
entry rather than creating a conflicting one:

```text
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/luma_deploy
    IdentitiesOnly yes
```

Run `chmod 600 ~/.ssh/config`, then clone the actual repository and branch
into the empty directory using its GitHub SSH URL:

```sh
git clone --branch main YOUR_READ_ONLY_REPOSITORY_URL /srv/luma
cd /srv/luma
git log -1 --oneline
sudo install -d -o luma -g luma -m 0755 /srv/luma/uploads
```

Check that the commit is the one you intended. The clone must contain
`package-lock.json`, `server/db/schema.sql`, and `deploy/`. Ensure Caddy and
`luma` can traverse `/srv/luma` and read its files:

```sh
sudo chmod 755 /srv/luma
```

Never copy your local `.env`, `node_modules`, or local `uploads/` into this
fresh deployment. Existing installations require the separate migration
procedure in section 13.

## 7. Create the database

PostgreSQL stays on the Droplet and is not exposed to the internet:

```sh
sudo systemctl enable --now postgresql
sudo -u postgres createuser --pwprompt luma
sudo -u postgres createdb --owner=luma luma
```

Enter a unique strong database password at the prompt. Verify PostgreSQL is
listening only locally (`127.0.0.1` and/or `::1`) and keep its `pg_hba.conf`
restricted to local access:

```sh
sudo ss -ltnp | grep 5432
```

Use a URL-safe generated password, or percent-encode special characters in the
password portion of `DATABASE_URL`. Keep the original password in a password
manager. Do not put it on a command line or in shell history.

## 8. Configure server secrets

```sh
sudo install -d -o root -g luma -m 0750 /etc/luma
sudo install -o root -g luma -m 0640 /srv/luma/deploy/droplet.env.example /etc/luma/luma.env
sudoedit /etc/luma/luma.env
```

Replace placeholders in the editor:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://luma:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/luma` |
| `ALLOWED_ORIGINS` | `https://app.example.com` (exact origin, no trailing slash) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Bucket-scoped R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | Corresponding R2 secret access key |
| `R2_BUCKET` | Private bucket name |
| `ADMIN_BOOTSTRAP_SECRET` | Uncomment and set a long, unique random value temporarily |

Keep `STORAGE_PROVIDER=r2`, `HOST=127.0.0.1`, `PORT=3000`,
`USE_HTTPS=false`, and `UPLOAD_DIR=/srv/luma/uploads`. Leave `DB_SSL` unset
for this local database. Use unquoted, shell-safe values with no spaces or
shell metacharacters: the same file is read by systemd and sourced during
migration. A hex bootstrap secret is suitable; `openssl rand -hex 32`
generates one. Save it directly into the protected file, not a tracked file.

## 9. Build, migrate and start

From `/srv/luma` on the **Droplet**:

```sh
cd /srv/luma
npm ci
env VITE_APP_MODE=production VITE_DATA_PROVIDER=local VITE_API_BASE_URL= npm run build
npm run build:server
sudo -u luma sh -c 'set -a; . /etc/luma/luma.env; set +a; cd /srv/luma; npm run db:migrate'
```

Run these in order and stop if any command fails. `local` selects the Express
data provider; it does **not** disable R2 when the server has
`STORAGE_PROVIDER=r2`. Build the frontend before the server because the
frontend build can clear `dist`. Keep development dependencies for subsequent
builds and migrations. The migration reads `server/db/schema.sql` from source.

Install the included service and Caddy config, then edit the installed Caddy
configuration to replace `example.com` with your actual domain:

```sh
sudo install -o root -g root -m 0644 deploy/luma.service /etc/systemd/system/luma.service
sudo install -o root -g root -m 0644 deploy/Caddyfile /etc/caddy/Caddyfile
sudoedit /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now luma caddy
sudo systemctl reload caddy
```

Check both layers:

```sh
sudo systemctl status luma caddy --no-pager
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://app.example.com/api/health
```

Both health responses should contain `"status":"ok"`. The endpoint confirms
the API responds; it does **not** prove database or R2 connectivity. Check
logs on failure:

```sh
sudo journalctl -u luma -n 100 --no-pager
sudo journalctl -u caddy -n 100 --no-pager
```

Open `https://app.example.com` and check for a valid browser certificate.
Caddy serves `dist`, forwards `/api/*` and `/uploads/*`, and forwards
`invitation_slug` requests for sharing metadata.

## 10. Create the first administrator

Run the following on the **Droplet**. It reads the bootstrap secret from the
protected file and prompts for the admin password without echoing it or putting
it in command history. The request travels only over loopback.

```sh
sudo python3 - <<'PY'
import getpass
import json
import urllib.error
import urllib.request

with open('/etc/luma/luma.env', encoding='utf-8') as config:
    secrets = [line.strip().split('=', 1)[1] for line in config
               if line.startswith('ADMIN_BOOTSTRAP_SECRET=')]
if len(secrets) != 1 or not secrets[0]:
    raise SystemExit('Set exactly one ADMIN_BOOTSTRAP_SECRET in the environment file.')
email = input('Admin email: ').strip()
password = getpass.getpass('Admin password (12–128 characters): ')
body = json.dumps({'email': email, 'password': password, 'secret': secrets[0]}).encode()
request = urllib.request.Request('http://127.0.0.1:3000/api/admin/bootstrap',
                                 data=body, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(request) as response:
        print(response.status, response.read().decode())
except urllib.error.HTTPError as error:
    raise SystemExit(f'Bootstrap failed: HTTP {error.code} {error.read().decode()}')
PY
```

Expect HTTP `201` and `Admin account created`. A `409` means an admin account
already exists; do not reset or delete production data to repeat bootstrap.
After success, remove the entire `ADMIN_BOOTSTRAP_SECRET` line with
`sudoedit /etc/luma/luma.env`, then run:

```sh
sudo systemctl restart luma
```

Sign in at `https://app.example.com/admin/login`, then create a host code via
the admin interface. The browser session requires HTTPS in production.

## 11. Verify the complete workflow

Use disposable test data until the launch-blocking access controls are fixed:

1. Sign in as admin, create a host code, sign in as the host, and create a
   test event. Verify records still exist after an API restart.
2. Open the guest event on an actual iPhone and Android phone over HTTPS.
   Grant camera access, capture and upload photos; confirm both iOS and
   Android uploads succeed.
3. In the host dashboard, view images, thumbnails and covers, download
   individual photos and a ZIP, and test deletion. Confirm corresponding R2
   objects appear or disappear. Verify invitation image uploads and
   shared-link previews after publishing.
4. Restart `luma`, refresh on another device or browser, and verify images and
   records persist. Verify an intentionally unknown image is not served.
5. Confirm that TCP 3000 and 5432 are not externally reachable; check firewall
   and listening addresses. Confirm HTTPS certificate renewal and monitor logs,
   disk space, memory, uptime, backup failures, and R2 usage.
6. Run `npm audit --omit=dev`, review findings, and resolve applicable
   production advisories. Verify the image and download authorization issue
   described at the top before public launch.

## 12. Backups and recovery

Droplet backups are useful for server recovery but are not a substitute for
independently tested database and object backups. Before accepting data:

1. Set recovery objectives and schedule encrypted, access-controlled
   **off-Droplet** PostgreSQL backups. For example, on the Droplet with a
   previously configured trusted GPG recipient:

   ```sh
   set -o pipefail
   umask 077
   sudo -u postgres pg_dump -Fc luma | gpg --encrypt --recipient YOUR_BACKUP_RECIPIENT > luma-db.dump.gpg
   ```

   Store the encrypted output off the Droplet with retention and restricted
   access, and delete the local copy after confirming a successful transfer.
   Protect the decryption key separately. A real scheduled backup must alert on
   either `pg_dump`, encryption, or transfer failure; check the command's
   status before transferring. The simple example above alone is not a
   monitored backup job.
2. Back up R2 objects to a separate protected location, preserving object keys
   and retaining earlier copies against accidental deletion. Use separate,
   least-privilege backup credentials and monitor the copy. A private bucket,
   lifecycle deletion rule, or single copy is not a backup.
3. Periodically restore the decrypted dump with `pg_restore` into a **separate
   test database** and restore the matching object backup into a separate test
   bucket. Test the app against both without overwriting production. Record
   recovery steps and verify that backups contain recent data.

## 13. Updates, rollback and existing data

For a release, first verify backups and review schema changes. From
`/srv/luma` on the **Droplet**, as the same administrator that cloned it:

```sh
git status --short --branch
git pull --ff-only
npm ci
env VITE_APP_MODE=production VITE_DATA_PROVIDER=local VITE_API_BASE_URL= npm run build
npm run build:server
sudo -u luma sh -c 'set -a; . /etc/luma/luma.env; set +a; cd /srv/luma; npm run db:migrate'
sudo systemctl restart luma
curl -fsS https://app.example.com/api/health
```

Stop on errors and repeat the workflow checks. Remember that replacing the
frontend build and restarting the server are not atomic. For rollback, retain
the previously deployed commit and tested backups. An older app may not work
with a newer schema; assess compatibility before rolling back, and restore
database and objects together only after explicitly deciding to discard newer
data. Never blindly run a destructive reset on production.

For an **existing local deployment**, R2 does not automatically receive
`uploads/`, and a fresh PostgreSQL database starts empty. Plan downtime or
write freeze, back up both database and files, restore the database, and copy
all existing files under `uploads/events/` to matching `events/` keys in the
R2 bucket. Preserve content types, verify representative originals,
derivatives and invitation assets, and compare the copies before cutover.
Test a full restore and rollback plan before switching real traffic.

## Troubleshooting

- **Certificate/DNS failure:** check DNS, public TCP 80/443, Caddy logs and
  domain spelling. Wait for propagation; check for incorrect AAAA records.
- **502:** check `systemctl status luma`, its journal and
  `curl http://127.0.0.1:3000/api/health`; verify Node is at `/usr/bin/node`.
- **Migration/login failure:** check local Postgres, role, database password,
  URL encoding and migration output. Do not print the environment file to logs.
- **Upload/image failure:** verify the four R2 values, bucket scope, default
  jurisdiction endpoint, outbound HTTPS, disk space and the `luma` journal.
- **CORS or login issues:** use exactly the HTTPS origin in `ALLOWED_ORIGINS`,
  including any `www` if that is the actual domain, and restart `luma` after
  changing the environment.
- **Missing social preview:** publish the invitation, request the generated
  share URL, verify Caddy's `invitation_slug` forwarding, and allow for social
  platforms' preview caches.

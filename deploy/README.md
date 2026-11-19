# DigitalOcean Basic Droplet (Ubuntu)

One Droplet runs Caddy (HTTPS + built Vite files), Express (port 3000), and
PostgreSQL (localhost only). Cloudflare R2 holds production images. Use the
`luma/` directory as the project root for every npm command below. Local testing
is unchanged: `.env.example`, `npm run dev:all`, local Postgres and `uploads/`.
Do not use the Vercel/Supabase environment template for this deployment.

## Provision

1. Point `example.com`'s DNS A record to the Droplet. Create an Ubuntu Basic
   Droplet with enough RAM for the build (or build elsewhere and deploy `dist/`).
   Install a current supported Node.js LTS, PostgreSQL, Caddy, and UFW. Enable
   DigitalOcean automated Droplet backups (these alone are not database backups).
2. Create an unprivileged `luma` user and put the application at `/srv/luma`
   (including `package-lock.json`, `server/db/schema.sql`, and `deploy/`).
   Make `/srv/luma` traversable to Caddy; allow `luma` to write the build output,
   `node_modules`, and `/srv/luma/uploads`. For example, after deploying source:

   ```sh
   sudo useradd --system --home /srv/luma --shell /usr/sbin/nologin luma
   sudo chown -R luma:luma /srv/luma
   sudo install -d -o luma -g luma -m 0755 /srv/luma/uploads
   ```

3. Keep PostgreSQL `listen_addresses = 'localhost'` and `pg_hba.conf` restricted
   to local connections. Create a database and login role, using a unique
   password entered interactively:

   ```sh
   sudo -u postgres createuser --pwprompt luma
   sudo -u postgres createdb --owner=luma luma
   ```

   Allow only SSH, HTTP and HTTPS inbound (DigitalOcean Cloud Firewall and/or
   UFW). **Never open 3000 or 5432 to the internet.** Set up an SSH key and
   restrict SSH access before enabling the firewall.

   ```sh
   sudo ufw default deny incoming
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

## Configure and deploy

1. Create a private R2 bucket and a bucket-scoped read/write R2 API token. Store
   credentials only in the server environment, not in `VITE_*` build variables.
   Do not publicly expose the bucket; image delivery uses the existing
   same-origin `/uploads/` API proxy. This route currently serves any known
   image path without authorization (as local mode did); implement guest and
   host download authorization before a public launch. Configure R2 object versioning/retention
   or a separate backup copy appropriate to your recovery requirements.
2. Copy `deploy/droplet.env.example` to `/etc/luma/luma.env`; replace all
   placeholders, URL-encode special characters in the database password,
   and restrict access. `ALLOWED_ORIGINS` is the exact public HTTPS origin.
   Leave `DB_SSL` unset for local PostgreSQL. `USE_HTTPS=false` keeps TLS at
   Caddy rather than generating the server's self-signed local-test certificate.

   ```sh
   sudo install -d -o root -g luma -m 0750 /etc/luma
   sudo install -o root -g luma -m 0640 /srv/luma/deploy/droplet.env.example /etc/luma/luma.env
   sudoedit /etc/luma/luma.env
   ```

3. Build the client and server, and migrate before starting the API. The Vite
   client uses the same-origin API (`VITE_API_BASE_URL` empty); `local` here
   selects the Express data provider, not filesystem-only production storage.
   Keep dev dependencies until both TypeScript and the `tsx` migration run.
   Run from `/srv/luma`:

   ```sh
   sudo -u luma npm ci
   sudo -u luma env VITE_APP_MODE=production VITE_DATA_PROVIDER=local VITE_API_BASE_URL= npm run build
   sudo -u luma npm run build:server
   sudo -u luma sh -c 'set -a; . /etc/luma/luma.env; set +a; npm run db:migrate'
   ```

   The migration loads the restricted environment file without entering the
   database password in shell history. Keep its values shell-safe (URL-encode
   the password). `db:migrate` reads
   `server/db/schema.sql` from source; `build:server` alone does not copy it.
   Review schema changes and back up the DB before running migrations on updates.

4. Replace `example.com` in `deploy/Caddyfile`, then install the two config
   files. Caddy automatically obtains and renews a public TLS certificate once
   DNS and ports 80/443 work. It serves Vite's `dist/` directly, proxies
   `/api/*` and `/uploads/*` to Express, and proxies invitation requests with
   `invitation_slug` so link-preview metadata is rendered by Express.

   ```sh
   sudo install -o root -g root -m 0644 deploy/Caddyfile /etc/caddy/Caddyfile
   sudo install -o root -g root -m 0644 deploy/luma.service /etc/systemd/system/luma.service
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl daemon-reload
   sudo systemctl enable --now postgresql caddy luma
   sudo systemctl reload caddy
   curl -fsS https://example.com/api/health
   ```

   Check `systemctl status luma caddy` and `journalctl -u luma -n 100` on
   failure; confirm an invitation's shared-link preview and image uploads.
   Rebuild, migrate, and `sudo systemctl restart luma` on each release.

## Storage readiness and recovery

With `STORAGE_PROVIDER=r2`, photo originals and derivatives, event covers,
invitation assets, and ZIP downloads use the private R2 bucket; PostgreSQL
stores the object paths. Multipart photo uploads use temporary Droplet disk
space while being transferred to R2. With `STORAGE_PROVIDER=local`, the same
paths continue to use `UPLOAD_DIR`, including local testing. Switching an
existing deployment from local storage to R2 does **not** copy existing files:
transfer them to matching object keys before switching providers.

Test R2 writes, reads, deletions, ZIP downloads, image link previews, and
persistence across an API restart and redeploy. The current public photo
download and `/uploads/` paths still need authorization before public launch.
Run `npm audit --omit=dev` and address production dependency advisories before
exposing the service publicly.

Back up Postgres independently of Droplet snapshots: schedule an encrypted
`pg_dump -Fc` to off-Droplet storage with retention and access controls; test
restore with `pg_restore` into a separate database. Include R2 objects (or local
uploads until cutover), and periodically test a complete database-plus-image
restore. Do not rely on an on-Droplet-only backup or a bucket lifecycle rule
that deletes the sole surviving copy. Rotate DB/R2 credentials after exposure,
and remove `ADMIN_BOOTSTRAP_SECRET` after first admin setup.

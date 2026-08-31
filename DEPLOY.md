# Deploying empire-agora, and moving the root domain to it

> **Nothing in this file has been executed.** It was written and verified locally by
> someone with no SSH key and no Cloudflare token. Every command is for the owner to
> run on the box. Where a step says *verify*, verify it — the ordering exists so that
> a failure is discovered while it is still cheap.

**What this does:** puts the new sales site on `empireenglish.online`, and moves the
existing portal to `portal.empireenglish.online`.

**What it is not:** a content change to the portal. That app is untouched; only the
hostname it answers on changes.

---

## 0. The hosting decision, and why it reversed

The spec originally said Cloudflare Pages, on the premise that this was a **static**
marketing site. That premise is gone.

The page must read a **cookie** and a **geo header** to decide which currency a
visitor sees, so Next server-renders it on demand. A static host cannot serve it.

So this mirrors the pattern **already proven in production on this box** by
`EEC-MATERIAL/web`: standalone Next build → Docker → bound to `127.0.0.1` → routed
through the existing Cloudflare Named Tunnel. No new toolchain on a day that is
already moving the root domain.

The edge alternative (`next-on-pages` / OpenNext) is not ruled out forever, but its
compatibility with Next 16 could not be tested without deploying — which is exactly
the wrong thing to learn during a cutover.

### Measured footprint

The exact process the container runs, profiled locally:

| | RSS |
|---|---|
| boot | 103 MB |
| 50 dynamic renders | 140 MB |
| 200 requests | **166 MB** ← observed peak |
| 15 s idle | 103 MB ← returns to baseline, no leak |

Container cap is **384 MB**, about 2.3× the observed peak. Image is ~210 MB.

---

## 1. Pre-flight — do this BEFORE anything else

This box is a 4 GB CX23 already running roughly ten containers, including `eec-web`
capped at 512 MB. Adding a service is not free.

```bash
ssh root@77.42.43.250
free -m                      # how much is genuinely spare?
docker stats --no-stream     # who is actually using it?
df -h /                      # a 210 MB image needs somewhere to live
```

**Stop if `free -m` shows less than ~600 MB available.** Do not proceed hoping swap
absorbs it — swap on a 2 vCPU box turns a memory problem into a latency problem for
every other service, including the bot.

Also confirm the tunnel is the one you think it is:

```bash
cat /root/.cloudflared/config.yml     # note the tunnel name and existing ingress
systemctl status cloudflared || docker ps --filter name=cloudflared
```

> **SSH key safety.** If you add a key for any reason, **append** it:
> `>> /root/.ssh/authorized_keys`. Never `>`. Keep the `empire-n8n` ed25519 key, and
> `grep empire-n8n /root/.ssh/authorized_keys` before you disconnect. Overwriting
> that file locks you out and requires Hetzner Rescue Mode.

---

## 2. Get the app running on 8090, with the root domain untouched

Nothing public changes in this step. If it fails, no one notices.

```bash
mkdir -p /opt/empire-agora
git clone https://github.com/empireenglishcommunity-glitch/empire-agora.git /opt/empire-agora
cd /opt/empire-agora

# Payment rails and the owner token. NEVER committed — see .env.example.
cp .env.example .env
nano .env          # fill RAIL_* and ADMIN_TOKEN (openssl rand -hex 32)

docker compose up -d --build empire-agora
```

> **The `orders_data` volume is not optional.** The order ledger is a SQLite file
> under `DATA_DIR`. Without the volume, every `docker compose up --build` silently
> discards every order — the worst failure this service can have. `docker compose`
> creates it from `docker-compose.yml`; just do not remove it, and do not run
> `docker compose down -v`, which deletes it.
>
> A rail with no configured account **refuses orders on that rail** (503) rather than
> creating an order nobody can pay. So an empty `RAIL_INSTAPAY` does not corrupt
> anything — it just makes InstaPay unavailable until you set it.

> Build **by service name**. A bare `docker compose up -d --build` on this box has
> failed before on another project's relative build context.

Unlike `eec-web`, there is **no `rsync` step**: this repo *is* the app, so it is
cloned and built in place. Nothing to mirror, nothing to get stale.

**Verify on the box, before touching DNS:**

```bash
docker compose ps                                    # empire-agora "Up"
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/ar          # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/ar/terms    # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/ar/privacy  # 200

# Currency must resolve from the geo header, and show exactly one currency:
curl -s -H 'cf-ipcountry: EG' http://127.0.0.1:8090/ar | grep -c 'ج\.م'    # > 0
curl -s -H 'cf-ipcountry: EG' http://127.0.0.1:8090/ar | grep -c '\$[0-9]' # 0
curl -s -H 'cf-ipcountry: SA' http://127.0.0.1:8090/ar | grep -c '\$[0-9]' # > 0
```

Then confirm it is **not** reachable from outside — Docker bypasses UFW, so
localhost binding is the only thing keeping it private:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://77.42.43.250:8090/ar   # must fail/refuse
```

---

## 3. Give the portal its own hostname — and verify it there FIRST

Still nothing changes for the public. The portal keeps answering on the root domain
throughout this step.

Add to `/root/.cloudflared/config.yml`, **above** the catch-all `http_status:404`:

```yaml
  - hostname: portal.empireenglish.online
    service: http://localhost:8080
```

```bash
cloudflared tunnel route dns <your-tunnel-name> portal.empireenglish.online
systemctl restart cloudflared      # or: docker restart cloudflared
```

**Verify the portal fully on the new hostname before the root domain moves.** This
is the step that makes the whole cutover reversible in practice:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://portal.empireenglish.online/ar   # 200
```

Then, in a browser: log in, open a lesson, and check the **coursebook gate** still
behaves. Losing this check is how the Teacher's Edition became publicly downloadable
once already:

```bash
# student edition, unauthenticated → 401 (the gate working)
curl -s -o /dev/null -w '%{http_code}\n' https://portal.empireenglish.online/api/coursebook/student
# teacher edition, with the admin token → 200 application/pdf
curl -s -o /dev/null -w '%{http_code}\n' -H "x-admin-token: $ADMIN_TOKEN" \
  https://portal.empireenglish.online/api/coursebook/teacher
# the raw PDF must NOT be public → 404
curl -s -o /dev/null -w '%{http_code}\n' https://portal.empireenglish.online/coursebook/eec-stage0-teacher.pdf
```

---

## 4. Tell the students, before you flip anything

**Every signed-in student will be logged out.** The `eec_session` cookie is scoped to
the apex domain; moving the app to a subdomain changes its scope, so existing
sessions stop matching.

At 15–17 students this is one WhatsApp message. It is only a problem if it is a
surprise. Send something like:

> النهاردة بننقل بوابة الطلبة لعنوان جديد. ممكن تحتاج تسجّل الدخول تاني — تقدّمك زي ما هو.
>
> `portal.empireenglish.online`

Send it **before** step 5, not after.

---

## 5. Move the root domain

Edit the **existing** root-domain ingress in `/root/.cloudflared/config.yml`, from
`localhost:8080` to `localhost:8090`:

```yaml
  - hostname: empireenglish.online
    service: http://localhost:8090        # was 8080
  - hostname: www.empireenglish.online
    service: http://localhost:8090        # was 8080
  - hostname: portal.empireenglish.online
    service: http://localhost:8080        # added in step 3
```

```bash
systemctl restart cloudflared
```

That is the whole cutover: **one file, two lines.** Which is also why rollback is
cheap.

---

## 6. Verify from outside the box

The point of the change is what the public reaches, so check it as the public.

```bash
for u in / /ar /en /ar/terms /ar/privacy /cohort /waitlist /ar/guide; do
  printf '%-16s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' https://empireenglish.online$u)"
done
```

Expected: `/` → 307 to a locale · `/ar` `/en` `/ar/terms` `/ar/privacy` → 200 ·
`/cohort` `/waitlist` → 308 · `/ar/guide` → 307 to the portal.

Then the things most likely to be quietly wrong:

```bash
# Currency isolation, live. The second command must print 0.
curl -s https://empireenglish.online/ar | grep -c 'ج\.م'
curl -s 'https://empireenglish.online/ar?c=EGP' | grep -c '\$[0-9]'

# The portal still works on its own hostname
curl -s -o /dev/null -w '%{http_code}\n' https://portal.empireenglish.online/ar
```

Finally, on a **real phone**: load `empireenglish.online`, confirm the Arabic renders
right-to-left with no horizontal scrolling, and that the plans section shows one
currency.

---

## 7. Rollback

Revert the two lines in `/root/.cloudflared/config.yml` back to `localhost:8080` and
restart `cloudflared`. That is it — no rebuild, no DNS wait, no data to restore.

The `portal.empireenglish.online` ingress can stay in place permanently either way;
it is additive and harms nothing.

If you want the container gone as well:

```bash
cd /opt/empire-agora && docker compose down
```

---

## 8. Known-imperfect, deliberately shipped

- **Fonts are not preloaded on the dynamic route.** Next drops `next/font`'s preload
  links when a route is server-rendered on demand, so the three faces are discovered
  only after CSS parses — a visible swap on the hero text, which is the LCP element.
  The bytes are budgeted and `display: swap` keeps text readable throughout. Worth
  fixing, not worth blocking on.
- **The checkout is not finished.** The order *capture* path is built and tested —
  `POST /api/orders` durably records an order and reveals payment instructions. The
  buyer-facing `/join` flow, proof-image upload and the owner verification queue are
  not built yet, so until they are, orders can only be created by API and every
  buyer-facing call to action still hands off to WhatsApp. That is the intended
  interim state, not a regression.

### Backing up the ledger

The orders volume is the only irreplaceable data this service holds. Add it to the
box's existing backup routine:

```bash
docker run --rm -v empire-agora_orders_data:/data -v /root/backups:/out alpine \
  sh -c 'cp /data/orders.db /out/orders-$(date +%F).db'
```

SQLite in WAL mode: copying `orders.db` alone can miss the most recent
transactions. Either stop the container first, or copy `orders.db`, `orders.db-wal`
and `orders.db-shm` together.

---

## Updating later

```bash
cd /opt/empire-agora
git pull
docker compose up -d --build empire-agora
docker compose ps
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/ar
```

No `rsync --delete` dance is needed here — that exists for `eec-web` because its repo
and its app directory are separate. This repo is built where it is cloned, so a
deleted file is genuinely gone after `git pull`.

## Before you consider it done

Run the gates against the deployed build, not just locally:

```bash
cd /opt/empire-agora && npm ci && npm run check
```

A green `docker compose ps` means the container started. It does not mean the prices
are right, the currency is isolated, or the Arabic renders correctly. Those are what
`npm run check` and step 6 are for.

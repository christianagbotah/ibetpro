# iBetPro — Production Deployment

This guide documents the current Lightworld production architecture. Do not use
older SQLite/port-3000 deployment instructions for this repository.

## Production architecture

```text
Internet
  |
  v
Nginx / TLS
  |
  v
Next.js standalone (PM2, 127.0.0.1:3017)
  |                     |
  |                     +--> MySQL/MariaDB (localhost:3306)
  |
  +--> iBetPro ML FastAPI (systemd, 127.0.0.1:8017)
```

Important VPS paths:

```text
/home/lightworld/webapps/ibetpro              # persistent Git checkout / worktree manager
/home/lightworld/releases/ibetpro-<sha>       # immutable application releases
/home/lightworld/services/ibetpro-web/current # symlink to active web release
/home/lightworld/services/ibetpro-ml/current  # symlink to ML code in active release
/home/lightworld/services/ibetpro-ml/ml.env   # ML-only runtime environment
/home/lightworld/venvs/ibetpro-ml             # Python inference virtualenv
```

Production should retain the active iBetPro release and one immediate rollback
release. Old build worktrees can be removed after health verification.

## Web deployment

The supported deployment path is the atomic release script. On an already
provisioned server, use the stable verified-release symlink:

```bash
bash /home/lightworld/services/ibetpro-web/current/deploy/deploy-and-activate.sh
```

The persistent Git repository remains at `/home/lightworld/webapps/ibetpro`
and is used internally by the deployment script as the worktree manager.

To deploy a specific verified SHA:

```bash
bash deploy/deploy-and-activate.sh <full-git-sha>
```

The script:

1. Fetches the production-foundation branch.
2. Creates a detached release worktree under `/home/lightworld/releases`.
3. Copies runtime environment files from the currently running release.
4. Runs `npm ci`, Prisma generation and a non-destructive `prisma db push`.
5. Builds Next.js standalone output.
6. Starts an isolated smoke server with `ML_MODEL_MODE=baseline`.
7. Switches PM2 to the new release only after smoke succeeds.
8. Verifies the production login endpoint.
9. Aligns the ML service `current` symlink with the same release when the
   `ibetpro-ml.service` unit is installed.
10. Rolls both web and ML release pointers back if the ML health check fails.

The production start step deliberately does **not** hard-code
`ML_MODEL_MODE=baseline`; an explicitly promoted shadow/active mode therefore
survives normal deployments. The isolated smoke test remains baseline-safe.

## Runtime environment

The standalone server reads its runtime environment from:

```text
<active-release>/.next/standalone/.env
```

The release root also keeps `.env.production`, which is propagated to the next
release. Never commit production secrets.

Common runtime keys include:

```text
DATABASE_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
ODDS_API_KEY
API_FOOTBALL_KEY
SPORTMONKS_API_TOKEN
ML_SERVICE_URL=http://127.0.0.1:8017
ML_MODEL_MODE=baseline|shadow|active
```

A provider being configured does not mean it is healthy. The admin Model
Research panel probes the ML service health endpoint and separately reports
provider configuration, ML reachability and whether a model artifact is loaded.

## ML service setup

The production ML service is localhost-only and runs as the unprivileged
`lightworld` account.

Create the Python environment:

```bash
python3.11 -m venv /home/lightworld/venvs/ibetpro-ml
/home/lightworld/venvs/ibetpro-ml/bin/pip install -U pip
/home/lightworld/venvs/ibetpro-ml/bin/pip install   -r /home/lightworld/services/ibetpro-ml/current/ml-service/requirements.txt
```

Install the service unit:

```bash
cp deploy/systemd/ibetpro-ml.service /etc/systemd/system/ibetpro-ml.service
systemctl daemon-reload
systemctl enable --now ibetpro-ml.service
```

Health check:

```bash
curl http://127.0.0.1:8017/health
```

A healthy baseline-only service should report `status=ok` with
`model.loaded=false`. This is expected until a qualified model is promoted.

The candidate-only endpoint intentionally returns HTTP 503 when no trained
candidate is loaded:

```text
POST /v1/predict/candidate
```

That behavior prevents shadow evaluation from silently substituting a baseline.

## Model promotion

Model artifacts are never enabled merely because training completed.

The promotion command validates:

- required model artifacts;
- artifact SHA-256 checksums from metadata;
- cross-season selective-policy approval;
- at least one stable selective divergence band;
- ML health after restart;
- web health after the mode switch.

Promote an approved artifact to shadow:

```bash
bash deploy/promote-ml-model.sh /path/to/approved-model shadow
```

Active mode requires a separate explicit confirmation:

```bash
CONFIRM_ACTIVE_PROMOTION=YES   bash deploy/promote-ml-model.sh /path/to/approved-model active
```

Return safely to baseline:

```bash
bash deploy/promote-ml-model.sh baseline
```

Promotion updates the running standalone environment and release-root
environment so the chosen mode survives the next normal deployment. A failed
health check restores the previous web and ML configuration.

## Licensed training path

Commercial model promotion must use licensed provider data.

Current production research path:

- Sportmonks — historical fixture/team context and enriched statistics.
- The Odds API — licensed historical 1X2 snapshots.
- API-Football — optional operational/backfill source where configured.

The manual workflow is:

```text
.github/workflows/licensed-model-experiment.yml
```

Historical Odds API execution is dry-run by default. Review the generated call
plan and estimated quota before explicitly enabling paid historical requests.

Public/free datasets retained in the repository are research/reproducibility
sources only where their licence does not permit commercial model training.
They must not be promoted into the production model path.

## Model modes

### baseline

Default production state. User-facing prediction remains on the verified
baseline/market-consensus path. A trained candidate is not required.

### shadow

A qualified model is loaded and evaluated without replacing user-facing
probabilities. Candidate failures must remain visible and auditable.

### active

Only an explicitly approved model may affect user-facing inference. Active mode
is not an automatic result of a successful training job.

## Operations

Web status:

```bash
pm2 status
pm2 describe ibetpro
pm2 logs ibetpro --lines 100 --nostream
curl -I http://127.0.0.1:3017/login
```

ML status:

```bash
systemctl status ibetpro-ml.service
journalctl -u ibetpro-ml.service -n 100 --no-pager
curl http://127.0.0.1:8017/health
```

Ports:

```bash
ss -ltnp | grep -E ':(3017|8017)\b'
```

Release/worktree inventory:

```bash
git -C /home/lightworld/webapps/ibetpro worktree list
du -sh /home/lightworld/releases/ibetpro-* 2>/dev/null
df -h /home
```

## Rollback principles

- Never delete the immediate previous release until the new release has passed
  public web and ML health checks.
- Never use `prisma db push --accept-data-loss` in an automated deployment.
- Never manually set active ML mode to bypass promotion evidence.
- Never expose port 8017 publicly; it is an internal service.
- Never place provider tokens or model secrets in Git-tracked files.


## First-party corpus sync timer

Production first-party training snapshots depend on routine sync calls as
fixtures enter the 24h, 6h and 1h pre-kickoff capture windows. Install the
timer after deploying a release that contains the sync units:

```bash
cp /home/lightworld/services/ibetpro-web/current/deploy/systemd/ibetpro-sync.service /etc/systemd/system/
cp /home/lightworld/services/ibetpro-web/current/deploy/systemd/ibetpro-sync.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ibetpro-sync.timer
```

The timer runs every 30 minutes and calls the localhost-only cron endpoint
through `deploy/run-sync-cron.sh`. The runner reads `CRON_SECRET` from the
active release environment without printing it. A normal sync respects provider
freshness and quota guards; it does not invoke paid historical-odds collection.

Operational checks:

```bash
systemctl status ibetpro-sync.timer
systemctl list-timers ibetpro-sync.timer
journalctl -u ibetpro-sync.service -n 50 --no-pager
```

The first-party corpus may legitimately remain empty when no supported fixture
is currently inside a capture window. The admin Model Research page reports
snapshot counts, labels and per-horizon coverage.

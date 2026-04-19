# CI/CD Secrets — GitHub Actions

This document describes all GitHub Actions secrets required for the CI/CD pipeline
([`ci.yml`](../.github/workflows/ci.yml) and [`deploy.yml`](../.github/workflows/deploy.yml)).
Without these secrets configured, the deployment workflow will fail.

## Secrets Reference

### `VPS_HOST`

| Field    | Value                                      |
|----------|--------------------------------------------|
| Purpose  | IP address or hostname of the VPS server for SSH deployment |
| Format   | IPv4 address or domain string (e.g. `185.249.225.169`) |
| Used in  | `deploy.yml` — SSH connection step         |
| Required | **Yes**                                    |

```bash
# Find your VPS IP:
# Check your hosting provider dashboard, or:
curl ifconfig.me  # run on the VPS itself
```

---

### `VPS_USER`

| Field    | Value                                      |
|----------|--------------------------------------------|
| Purpose  | SSH username used to connect to the VPS    |
| Format   | String (e.g. `root`)                       |
| Used in  | `deploy.yml` — SSH connection step         |
| Required | **Yes**                                    |

Typically `root` for a freshly provisioned VPS. Use a dedicated deploy user for hardened setups.

---

### `VPS_SSH_KEY`

| Field    | Value                                                     |
|----------|-----------------------------------------------------------|
| Purpose  | Private SSH key granting access to the VPS               |
| Format   | Multiline PEM string (begins with `-----BEGIN ... KEY-----`) |
| Used in  | `deploy.yml` — SSH connection step                        |
| Required | **Yes**                                                   |

#### How to generate

```bash
# 1. Generate a new ED25519 key pair (on your local machine)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/quantika_deploy

# 2. Copy the public key to the VPS
ssh-copy-id -i ~/.ssh/quantika_deploy.pub root@<VPS_HOST>

# 3. Verify SSH access works
ssh -i ~/.ssh/quantika_deploy root@<VPS_HOST> "echo ok"

# 4. Print the private key — paste this into the GitHub secret
cat ~/.ssh/quantika_deploy
```

The private key (including the `-----BEGIN` and `-----END` lines) is the value to store in `VPS_SSH_KEY`.

---

### `NTFY_TOPIC`

| Field    | Value                                                  |
|----------|--------------------------------------------------------|
| Purpose  | Topic string for ntfy push notifications on CI/CD events |
| Format   | String (e.g. `my-project-alerts`)                     |
| Used in  | CI/CD notification steps (optional)                   |
| Required | **No** (optional — skipped if not set)                |

ntfy is a simple HTTP-based push notification service. The topic acts as a unique channel name.
Choose a hard-to-guess string to avoid unwanted subscribers.

---

## How to Add Secrets in GitHub

1. Go to your repository on GitHub.
2. Navigate to **Settings** → **Secrets and variables** → **Actions**.
3. Click **New repository secret**.
4. Enter the secret **Name** (e.g. `VPS_HOST`) and **Value**.
5. Click **Add secret**.

Repeat for each secret listed above.

> **Note:** Secret values are write-only after creation — GitHub does not display them again.
> To update a secret, click the secret name and choose **Update**.

---

## Verification

```bash
# List configured secrets for this repository (requires gh CLI)
gh secret list

# Expected output:
# NTFY_TOPIC    Updated 2026-...
# VPS_HOST      Updated 2026-...
# VPS_SSH_KEY   Updated 2026-...
# VPS_USER      Updated 2026-...
```

To verify that the deploy workflow can actually connect, trigger it manually:

```bash
# Trigger deploy workflow from the CLI
gh workflow run deploy.yml

# Watch the run status
gh run list --workflow=deploy.yml --limit=5
```

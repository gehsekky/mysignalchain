# mysignalchain

Read `docs/PLAN.md` first. It is the source of truth for scope, architecture and decisions.

## How we work

- Work on one milestone at a time, in the order the plan lists them.
- Propose a plan for each milestone and wait for approval before writing code.
- Treat the plan's Engineering standards section as requirements.
- Before finishing a milestone, run the tests and check every acceptance criterion.
- When a decision changes, update `docs/PLAN.md` in the same change.

## Environment

- Development runs on Ubuntu in WSL2. Use bash, not PowerShell.
- Local Postgres runs in Docker.
- AWS resources belong in the separate `gehsekky-infra` repo (Terraform), through its PR flow. In this workspace it's at `~/code/gehsekky-infra`.

## Shared production instance

Production shares an EC2 instance with Pansori, so a mistake here can take down another site. See "How infrastructure is split" in the plan. In particular:

- Never run `docker system prune` or anything else that affects the whole host.
- Run `nginx -t` before every Nginx reload.
- Never build images on the instance.
- Confirm with the user before changing anything on the instance or in the `gehsekky/pansori` repo.

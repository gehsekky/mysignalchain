# mysignalchain.com — Build Plan

Nov 5, 2026 · Andy Chung

## Overview

mysignalchain.com lets guitarists build, version and share their signal chains as interactive graphs. The signal chain is the product. The gear catalog, collections, reviews and social features exist to support it.

Core ideas:

- A **signal chain** is a graph of gear connected port to port (input, output, FX send/return, stereo L/R). It is drawn visually, not as a list.
- Every saved change creates a new **immutable version**. Reviews and comments attach to a specific version, so history is never lost.
- **Anyone can view** a public chain from a share link. Reading or writing reviews and comments requires an account.
- Starts with guitar. Bass and keys come later, with no schema changes needed.

### How to use this plan with Claude Code

1. Save this file in the repo as `docs/PLAN.md`.
2. Add a short `CLAUDE.md` at the repo root that says: read `docs/PLAN.md` first, follow the engineering standards section, work one milestone at a time.
3. For each milestone, ask Claude Code to plan first (plan mode), review the plan, then let it implement. Ask it to run the tests and tick the acceptance criteria before moving on.
4. When a decision in the Open decisions section is made, update this plan, so it stays the source of truth.

Suggested first prompt: *"Read docs/PLAN.md. Propose an implementation plan for Milestone 0 only, including the folder structure and the commands you'll run. Don't write code until I approve."*

## Scope

The MVP is everything needed for one guitarist to build a chain, share a link, and get reviews on it, plus the social, trust and legal features in the MVP column below. It is built in phases (see Milestones) and tested at the end of each one, so issues surface before launch. The Later column waits until after the MVP.

| Area | MVP | Later |
| --- | --- | --- |
| Accounts | Google sign-in, unique handle, profile page, 13+ age gate, account deletion and data export | Email link sign-in, two-factor |
| Gear catalog | Brands, categories, gear items with ports; user submissions with a moderation queue; search | Brand claim program, affiliate price feeds, bass and keys categories |
| Collections | Gear I own, with notes and mods; wishlist | Gear history (bought/sold timeline) |
| Signal chains | Graph editor, immutable versions, fork a chain, custom nodes for gear not in the catalog | Modeler preset import (Helix, Quad Cortex, Fractal), embeds, intentional feedback loops |
| Viewing and sharing | Public / unlisted / private, share links, read-only graph viewer, mobile list view, per-version preview images, scene picker | Version diff view, embeddable widget |
| Reviews and comments | Rated reviews and threaded comments on gear items and chain versions, gated behind login | Helpful votes, review sorting |
| Social | Follow users, simple activity feed, email notification when someone reviews your chain (with opt-out) | Mutual friends, in-app notifications, messaging |
| Trust and safety | Report content, admin moderation queue, DMCA takedown workflow | Automated image moderation |

## Tech stack

One TypeScript codebase on Next.js and Postgres keeps the build simple for a solo developer working with Claude Code. This stack is confirmed (Nov 6, 2026).

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict mode | One language front to back; shared types for the graph |
| Web framework | Next.js (App Router) | Server rendering for public chain pages, SEO, preview images |
| Database | PostgreSQL in its own Docker container on the shared EC2 instance, data on a separate EBS volume, not exposed publicly | No extra hosting bill, and local and production use the same driver. Separate from Pansori's Postgres so upgrades and restores stay independent |
| ORM and migrations | Drizzle | Typed queries, plain SQL migrations, run as a deploy step before the new container starts |
| Auth | Better Auth with its Drizzle adapter, users stored in our Postgres; Google sign-in only at first | No per-user fees; we own the users table. Auth.js is now maintained by the Better Auth team, who recommend Better Auth for new projects. Email links, CAPTCHA and two-factor can be added later as plugins |
| Validation | Zod | One schema for forms, API input and graph validation |
| Styling | Tailwind with shadcn/ui | Components are copied into the repo, so they're fully customizable with no runtime dependency; keeps public pages light; React Flow's custom nodes can use the same styles |
| Graph editor | React Flow (@xyflow/react) | Custom nodes, port handles, pan and zoom |
| Auto-layout | ELK.js (layered, left to right, port constraints), run in the editor, never on public page views | Handles ports and branches better than simpler layout libraries; too heavy to run per view on a small shared server |
| Image storage | Amazon S3 + CloudFront on an images subdomain, resized on upload (sharp, limited concurrency) | Same account as everything else; uploads go straight to S3 with presigned URLs; CloudFront keeps image traffic off the instance. Removing an image also invalidates it in CloudFront |
| Preview images | next/og | Renders per-version share cards on the server. It supports only a subset of CSS and layout, so test it against a real graph early; the fallback is converting the viewer's SVG to PNG with sharp |
| Hosting | Next.js (standalone) in a Docker container on the existing `pansori` EC2 instance (`t4g.small`, ARM, 2 GB RAM), with memory and CPU limits and swap enabled | A hobby site on capacity already paid for: the reservation runs through May 2029. A check on Nov 6, 2026 showed about 1.25 GB of memory available and about 1% average CPU |
| DNS and TLS | Route 53 hosted zone; Let's Encrypt for the app, ACM for the images subdomain | Zone created in gehsekky-infra (Terraform); the domain is registered at Porkbun, whose authoritative nameservers are set to the zone's four Route 53 nameservers; the apex points at the instance's Elastic IP and renews its certificate on the instance, like Pansori |
| Secrets | SSM Parameter Store, loaded into the container at deploy | Nothing in the repo |
| CI/CD | GitHub Actions with an AWS OIDC role: build the ARM image in CI, push to ECR, deploy through SSM Run Command | No long-lived AWS keys and no SSH; images are never built on the instance |
| Monitoring and cost | CloudWatch logs, alarms and a memory metric, uptime check, AWS Budgets alerts | Catch errors, memory pressure and surprise bills early on a shared instance |
| Testing | Vitest (unit, integration), Playwright (end to end) | Fast unit tests; real browser tests for sharing and gating |
| Email | Amazon SES | Review notifications (M6), and sign-in links if added later; request production access ahead of M6, since new accounts start in the SES sandbox |

### How infrastructure is split

The existing `gehsekky-infra` repo (Terraform, state in S3, applied by CI on every push to `main`, us-east-1; changes are committed straight to `main` after a local `terraform plan`) owns all AWS resources and the shared front door on the instance. The `mysignalchain` repo owns the application, its Docker image and its deploy workflow.

| Owned by | Resources |
| --- | --- |
| `gehsekky-infra` (Terraform) | Route 53 zone for mysignalchain.com (`prevent_destroy`), CAA records allowing Amazon and Let's Encrypt, ACM certificate and CloudFront for the images subdomain, S3 buckets for images and backups, ECR repository, EBS data volume and snapshot schedule, additions to the instance role, SES domain identity with DKIM, custom MAIL FROM, SPF and DMARC records, AWS Budgets alert, an email alert topic with host memory and status-check alarms (memory published by a timer in `host/metrics/`), the OIDC deploy role, and outputs the app repo needs |
| `gehsekky-infra` (`host/edge/`, plain files, not Terraform) | The shared Nginx proxy (`edge-nginx`): its Compose file, base config, the Certbot reload hook and an install script that checks the config before reloading |
| `mysignalchain` repo | Next.js and Postgres containers, Compose file, Nginx site file, backup job (a systemd timer installed by the deploy, which also deletes expired sessions), deploy workflow, secrets references. Its backup alarm is in `gehsekky-infra` |
| `gehsekky/pansori` repo | Pansori's containers and its own Nginx site file |

Details to get right:

- **Email records differ from your other domains.** gehsekky.com and pansorirpg.com publish "sends no mail" records (null MX, `v=spf1 -all`, DMARC `p=reject`). Don't copy that here: mysignalchain.com sends notification email through SES. Use SES's DKIM CNAMEs, `v=spf1 include:amazonses.com -all` on the MAIL FROM subdomain, and start DMARC at `p=none` with reporting, tightening it once mail flows cleanly.
- **The instance is shared with Pansori.** A crash, memory leak or bad deploy here must not take Pansori down. Set container memory and CPU limits, add swap, and never run builds on the instance.
- **Nginx is shared, so it belongs to neither app.** Until M0, the `pansori-nginx` container in Pansori's Compose project owned ports 80 and 443. M0 replaces it with an `edge-nginx` container in its own Compose project (`/opt/edge` on the host), defined in `gehsekky-infra`. Its base config rejects unknown hostnames and includes `/etc/nginx/sites/*.conf`; each app keeps its own site file in its repo, copied to `/opt/edge/sites/`. Apps reach the proxy over an external Docker network named `edge`, created once on the host. Pansori's backend and frontend join it; neither Postgres container does. A Pansori deploy therefore never restarts the proxy. The switch causes one brief Pansori outage.
- **Our site can't be allowed to stop Nginx.** Nginx won't start if an upstream can't be resolved or a certificate file is missing, and that would take Pansori down too. Resolve the upstream per request, using Docker's DNS (`resolver 127.0.0.11`) and a variable in `proxy_pass`. Run `nginx -t` before every reload.
- **Certificates use the existing renewal setup.** Certbot runs on the host with a webroot at `/var/www/certbot`, a daily `certbot-renew` timer and a hook that reloads Nginx. The first time, DNS must point at the instance and the site file must serve only port 80 until certbot has issued the certificate; the HTTPS block is added after that. The reload is a Certbot deploy hook in `/etc/letsencrypt/renewal-hooks/deploy/`, so it applies to every certificate on the host and runs `nginx -t` before reloading `edge-nginx`.
- **Pansori's deploy prunes the whole host.** It runs `docker system prune -af`, which removes every stopped container, unused network and image not in use, but not volumes. So the shared network must be external (it survives the prune because `edge-nginx` is always attached to it), a stopped mysignalchain container will be deleted, and rollback must pull its image from ECR. Our deploy redeploys if its container is missing, removes only its own old images, and never runs a system-wide prune.
- **The instance role is shared.** An instance has only one IAM role, so both apps effectively share its permissions. Scope additions to `mysignalchain-*` resources and keep them to what the app needs.
- **Backups are our job.** Nightly `pg_dump` to S3 with retention, plus scheduled EBS snapshots, so up to a day of data could be lost. Postgres upgrades are also ours to run.
- **One deploy role, from `main` only.** It can push to the ECR repository and run the deploy through SSM on this instance, and nothing else.
- **No preview environments.** CI tests each branch against a throwaway Postgres. Production is publicly reachable from M0, with no password gate; launch means announcing the site, not opening it.
- **Order of work:** push the Terraform change in `gehsekky-infra` first, set Porkbun's nameservers to the new zone's, then wire the outputs into the app repo's GitHub Actions variables, as with `gehsekky-app`.

## Data model

The model separates a gear model in the catalog from a unit someone owns, and a chain from its immutable versions. Reviews point at either a gear item or one chain version.

| Entity | Purpose | Key fields |
| --- | --- | --- |
| `users` | Accounts and profiles | handle (unique, null until onboarding is finished), display_name, bio, avatar_image_id, birth-year check passed |
| `follows` | One-way follows | follower_id, followee_id (composite key) |
| `brands` | Manufacturers | name, slug |
| `gear_categories` | Tree of categories | slug, name, parent_id (e.g. pedal > overdrive, amp > head, utility > splitter, power > supply, controller > expression pedal, controller > MIDI switcher) |
| `gear_items` | Catalog entry for a model | brand_id, model_name, slug, category_id, variant_of_id, years, status (pending / approved / merged), merged_into_id, created_by, role (source / destination / null), routing_model (fixed / loop_switcher / channels / switch / programmable), routing_spec (JSONB), specs (JSONB, item-level specs) |
| `gear_ports` | Jacks on a gear item | gear_item_id, key (e.g. `in`, `out`, `send`, `return`, `exp_in`, `midi_in`, `midi_thru`, `dc_in`, `power_out_1`), direction (in / out), **signal_types** (one or more of audio / acoustic / expression / control / midi / power / usb, since a jack can be shared, such as MIDI/EXP), jack_group (logical ports on one physical jack, such as a TRS insert's send and return), spec (JSONB, validated per signal type), label |
| `gear_port_paths` | How signal passes through a gear item | gear_item_id, from_port_key, to_port_key, active_when_unplugged (optional port key; the path applies only while that jack is empty). An amp has `in` → `send`, `return` → `out`, and `in` → `out` while `return` is unplugged |
| `gear_controls` | Optional knob and switch schema | gear_item_id, key, label, kind (knob / switch / select), range or options |
| `owned_gear` | A unit in a user's collection | user_id, gear_item_id, nickname, mods, notes, status (owned / sold / wishlist), visibility |
| `images` | Every stored image | uploader_id, storage_key, width, height, source, license, attribution, moderation_status |
| `gear_item_images` | Images shown on a catalog page | gear_item_id, image_id, sort |
| `signal_chains` | The chain, across all versions | owner_id, public_id (random short id), slug, title, description, visibility, latest_version_id, forked_from_version_id |
| `chain_versions` | One immutable snapshot | chain_id, version_number, changelog, content_hash, created_at |
| `chain_nodes` | Gear placed in a version | version_id, node_key, gear_item_id (null for custom nodes), owned_gear_id (plain ID, no foreign key), custom_label, gear_snapshot (JSONB), settings (JSONB), bypassed, notes |
| `chain_edges` | Cables between ports | version_id, from_node_key, from_port_key, to_node_key, to_port_key, signal_type (which type this cable carries, for shared jacks) |
| `chain_layouts` | Where boxes sit on screen | version_id, positions (JSONB: node_key → x, y); editable without a new version |
| `chain_scenes` | Named presets within a version (Clean, Rhythm, Lead) | version_id, scene_key, name, sort, is_default, state (JSONB keyed by node_key: engaged loops and order, channel, programmable routes, bypass, setting overrides, MIDI messages sent); immutable like the rest of the version |
| `reviews` | Reviews and comments | author_id, gear_item_id or chain_version_id (exactly one), parent_id for replies, rating (1–5, top level only), body, edited_at, deleted_at |
| `slug_history` | Redirects after renames | chain_id, old_slug |
| `handle_history` | Redirects and reservations after handle changes | old_handle (unique), user_id (null once the account is deleted), release_at (set on account deletion) |
| `reports`, `dmca_notices` | Trust and safety | target, reason, status, resolution notes |
| `version_takedowns` | Hides a version without editing it | version_id, dmca_notice_id, status (active / restored), created_at, resolved_at |

Rules to enforce:

- **Versions are never edited, but can be removed.** No updates to `chain_versions`, `chain_nodes`, `chain_edges` or `chain_scenes` after insert; enforce in code and with a database trigger, with no exceptions. Saving creates a new version. The trigger also blocks `DELETE` unless the transaction explicitly sets a flag, which only the account deletion and takedown code does. This flag prevents accidents; it isn't a security boundary.
- **Takedowns hide first, then delete.** An active `version_takedowns` row hides the version through the policy module, without touching its content. It can be restored after a counter-notice; the version is permanently deleted only if the takedown stands.
- **Handles are lowercase and restricted.** 3–30 characters: lowercase letters, digits and single hyphens, starting and ending with a letter or digit. Stored in lowercase, so `Andy` and `andy` are the same handle. A short blocklist (`admin`, `support`, `staff`, `moderator`, `mysignalchain` and similar) is enforced at sign-up and on change.
- **Onboarding finishes the account.** Google sign-in creates the user before they've chosen a handle, so a required step after first sign-in collects the handle and the 13+ check. Until it's complete, the policy module blocks everything except onboarding. Failing the age check deletes the account.
- **Handle changes keep old links working.** A user can change their handle once every 30 days. `handle_history` redirects old handles to the current one and keeps them reserved for that account, so nobody else can take over those links. When an account is deleted, its current and old handles stay reserved for 90 days, then are released.
- **Account deletion is a hard delete.** The user's chains and versions are permanently deleted, along with any reviews on them. Forks stay, because they hold their own copies of nodes and edges, and their `forked_from_version_id` becomes null. The user's reviews on other people's content are deleted; a review with replies keeps its place as a "deleted" placeholder with its text and author removed (so `reviews.author_id` is nullable). This logic lives in our own `lib/` module, called from Better Auth's `beforeDelete` hook, and deletion requires a recently signed-in session.
- **Each node stores a snapshot of its gear.** On save, `gear_snapshot` records the display name, category, ports, port paths, controls, routing model and routing spec, plus the nickname and mods for owned gear. Custom nodes snapshot their default ports. The viewer, validation, loop tree, scenes and preview cards read only the snapshot, so catalog and collection edits can't change an old version.
- **Catalog items are never hard-deleted.** `gear_item_id` stays on the node, so "which chains use this pedal" still works, and merged items follow `merged_into_id`.
- **`owned_gear_id` is only a link.** It has no foreign key, and the page links to the gear only if it still exists and is visible. Selling or removing gear never touches a version.
- **Owned gear details are shown before they're published, and aren't forked.** The editor shows that the nickname and mods will be public on a public chain. Forks drop `owned_gear_id`, nickname and mods.
- **Catalog updates are opt-in.** When a chain's gear has changed in the catalog, the editor offers "update gear data". Accepting matches ports by key, flags cables that no longer fit, and takes effect in the next saved version.
- **`node_key` is stable across versions.** A node keeps its key when copied into the next version, which makes diffs and history work.
- **Reviews have exactly one target**, enforced with a CHECK constraint on the two nullable foreign keys, so referential integrity holds.
- **One rated review per user per target**, via a partial unique index. Comments without a rating are unlimited.
- Nodes and edges are normalized tables, not one JSON blob, so "which chains use this pedal" is a simple query.

### Port specs by signal type

Each port's `spec` holds the fields for its signal type. Item-level specs, like a power supply's total capacity, go in the `specs` JSONB column on `gear_items`.

| Signal type | Typical ports | Spec fields |
| --- | --- | --- |
| audio | in, out, send, return, out_l, out_r, speaker_out | channel (mono / left / right / stereo), level (instrument / line / speaker), impedance in ohms (speaker ports) |
| acoustic | a cab's speaker, a mic's capsule | none; connects a cab to a microphone with no physical cable |
| expression | exp_in, exp_out | TRS wiring (tip-active or ring-active) |
| control | tap, aux, ctl, channel_switch | momentary or latching, polarity |
| midi | midi_in, midi_out, midi_thru | connector (5-pin DIN / TRS / USB), TRS type (A / B) |
| power | dc_in, power_out_1 … power_out_n | voltage (accepted range for inputs; fixed or selectable for outputs, e.g. 9 / 12 / 18 V), AC or DC, polarity (center negative / positive), current in mA (draw for inputs, maximum for outputs), isolated (outputs), connector (2.1 mm / 2.5 mm barrel, USB-C, IEC) |
| usb | usb | role (host / device), carries (audio, MIDI) — later |

## Signal chain graph

The graph connects ports, not just boxes, so effects loops, stereo rigs and splits work. All graph logic lives in one shared, framework-free TypeScript module (`lib/graph`) with full unit tests. The editor, the viewer, the preview images and the server all use it. For saved versions, port, path and routing data comes from each node's `gear_snapshot`, not the live catalog.

### Validation rules

1. Every edge goes from an `out` port to an `in` port.
2. Each audio, expression, control and MIDI port has at most one cable, like a real jack. Power outputs are the exception: a daisy-chain cable can feed several pedals from one output. Splitting or merging a signal needs a utility node (ABY box, splitter, mixer), and so does combining or adapting power (current doubler, polarity reverser).
3. Signal must not loop. Check for cycles per scene, on the path actually in use: `gear_port_paths` connect ports inside fixed devices, and configurable devices (switchers, programmable modelers) contribute only the routes set in that scene. An amp's FX loop is then not a cycle: `in` → `send` → delay → `return` → `out`. Intentional feedback loops are blocked in the MVP, as a known limit.
4. A missing source or destination is only ever a warning, so a chain can be just a pedalboard. Sources and destinations come from each gear item's `role`: instruments are sources; cabs, combo amps, interfaces and headphones are destinations.
5. Mono into stereo-only, or a stereo pedal used in mono, is a warning, never an error.
6. Custom nodes (gear not in the catalog) start from a template (source, effect, stereo effect, amp with FX loop, destination), have editable ports including MIDI and power, and get a "submit to catalog" prompt. Their ports and role are stored in `gear_snapshot`.
7. A path with `active_when_unplugged` applies only while that jack is empty, as with normalled jacks. An amp with an empty FX loop still passes signal, and a stereo pedal fed only at `in_l` can feed both outputs.
8. Gear with no audio connection gets a warning unless it's non-audio gear, such as a controller, expression pedal or supply. Unconnected power is never a warning, since pedals may use batteries or a power layer may not be drawn.
9. Speaker-level mistakes are prominent red warnings, like voltage ones: a speaker output into anything that isn't speaker-level, a head with no load connected, or a cab impedance that doesn't match the output. They warn rather than block, since catalog data can be wrong.

### Non-audio connections

A cable connects two ports that share a signal type, and records which type it carries. Signal order, the cycle check and the mobile list view use audio and acoustic connections only; MIDI, control and power cables never change the order of the signal.

- **Expression and control:** an expression pedal, or a pedal's exp out, connects to an exp in. A TRS wiring mismatch is a warning.
- **MIDI:** thru counts as an outgoing port and daisy chains through thru are normal, so only block a device sending to itself. Warn on a TRS type A / B mismatch (adapters exist). A node's settings can record its MIDI channel and the program changes it receives.
- **Power:** a supply (Truetone 1 Spot Pro CS6 or CS12, Voodoo Lab Pedal Power, a wall-wart) is a node like any other. Its outputs connect to each pedal's `dc_in`. Selectable output voltages are stored in the supply node's settings.
- **Power checks** (all warnings, never blocking, since catalog data can be wrong):
  - output voltage outside the pedal's accepted range, or AC into a DC input, shown as a prominent red warning
  - polarity mismatch
  - total draw on one output (daisy chains included) above that output's rating
  - total draw on the supply above its overall capacity
  - a gentle note that daisy-chained pedals share a ground and may add noise
  - all of these follow power through utility nodes, so a doubler, reverser or adapter is included in the checks
- **Power panel:** a chain page section listing each supply output, the pedals on it, and current used versus available as a bar. The main graph hides power cables by default.
- **Rendering:** MIDI, control and power cables are drawn dashed in their own colors, with a toggle per layer, so a big switcher rig doesn't turn into spaghetti.

### Loops, routing models and scenes

The port graph stays the source of truth for wiring. Loops are derived from it, and scenes describe what each device does with its loops. This covers loop switchers, amp channels, A/B/Y boxes and modelers without changing how cables are stored.

**Routing models** (on `gear_items`) say how signal can pass through a device:

| `routing_model` | Examples | `routing_spec` holds |
| --- | --- | --- |
| fixed | Most pedals, cabs | Nothing extra; uses `gear_port_paths` |
| loop_switcher | Boss ES-8, GigRig G3, simple true-bypass loopers | List of loops (send and return port per loop), whether loops can be reordered, whether loops can run in parallel |
| channels | Multi-channel amps | Channel names; which ports each channel uses |
| switch | A/B/Y box | Positions (A, B, both) and the port paths for each |
| programmable | Helix, Quad Cortex, Fractal | Nothing fixed: the routes between ports are set on each node and can change per scene, so the 4-cable method and a plain in-to-out setup use the same catalog item |

**Derived loop tree.** For every send/return pair (a switcher loop, an amp FX loop, and the chain itself from source to destination), follow the audio cables from send to return; whatever sits in between is that loop's contents. Loops are computed, never stored, so they can't drift from the wiring. Most rigs decompose cleanly into nested loops. When a device sits in two loops (a modeler used in the 4-cable method), the tree shows it as split parts, "Helix, part 1" and "Helix, part 2." Splits and merges, such as a wet/dry rig or two amps, appear as parallel branches. A rig that won't fit a tree, such as cross-wired switcher loops, falls back to a flat list in signal order with a short note. Separate signal paths in one chain are shown separately.

**Scenes.** Each version has a default scene and can have more (`chain_scenes`). A scene stores per-node state: engaged loops and their order, amp channel, switch position, programmable routes, bypass, setting overrides and MIDI program changes sent. Non-default scenes store only what differs from the default.

**Effective signal path.** `lib/graph` computes the audio path for a scene from the wiring plus each device's routing in that scene. The result is a graph rather than a single line, since it can branch and merge. Validation, signal order and the mobile list view run per scene. Rules:

- A disengaged loop is skipped; its pedals stay on the graph, dimmed.
- Reordering loops changes the effective order, not the cables.
- Parallel loops are allowed only where the switcher's `routing_spec` says so.
- A scene that produces no path from source to destination is a warning.
- Editing a scene creates a new version, since it changes the sound.

### Rendering

- **Editor:** React Flow, with custom node components that show each port as a handle. Dragging a box saves to `chain_layouts` without creating a new version.
- **Auto-layout:** ELK layered layout, left to right, with port constraints. Runs in the editor when a chain has no saved layout, or on demand, and the result is stored in `chain_layouts` when the version is saved. The viewer and preview images only read saved positions, so every saved version must have a layout.
- **Read-only viewer:** a server-rendered SVG built from the same layout data. It loads fast on share links and doesn't need the editor bundle.
- **Mobile list view:** steps generated in signal order from the port graph, shown as the loop tree for the selected scene, each loop indented under the device that owns it, with parallel branches for splits and merges. Controllers, expression pedals, supplies and unconnected gear appear in an "Also on this board" section. The default on narrow screens, with the graph a tap away.
- **Version diff (later):** compare two versions by `node_key` to show added, removed and rewired gear and changed settings.

## Share links, visibility and gating

Anyone with a link sees the chain. Only signed-in users see review and comment text, and that text is never sent to a logged-out browser.

| URL | Shows |
| --- | --- |
| `/u/{handle}` | Profile, public chains, collection |
| `/u/{handle}/chains/{slug}` | Latest version of a chain (readable link) |
| `/c/{publicId}` | Latest version (short link; the Share button copies this) |
| `/c/{publicId}/v/{n}` | One pinned version, permanent; review links point here |
| `/gear/{brand}/{model}` | Catalog page for a gear item |

| Visibility | Who can view | Search engines |
| --- | --- | --- |
| Public | Anyone | Indexed, in sitemap |
| Unlisted | Anyone with the link | `noindex`, not in sitemap or site search |
| Private | Owner only; others get a 404 (not 403, so the chain's existence isn't revealed) | Not indexed |

Gating rules:

- Logged-out visitors get the graph, settings, notes, review count and average rating, plus a "sign up to read 23 reviews" prompt.
- Gating happens on the server: anonymous requests never query or return review bodies, and the API answers 401.
- After sign-up, return the user to the chain they came from.
- A chain's latest page also shows counts for earlier versions ("12 reviews on earlier versions") linking to them.

Preview images:

- Each version gets a share card at `/c/{publicId}/v/{n}/og.png`: the graph render, title and owner, generated with next/og.
- The app renders each card on first request and caches it on disk, keyed by version, chain title and owner handle, so renames and handle changes produce a new card on their own. Every request still goes through the policy module, so a takedown, deletion or visibility change stops the card right away. Responses tell other sites to cache for about one day; copies they already hold are outside our control. The latest link's metadata points at the newest version's card, so it updates on its own.
- Renamed chains keep working through `slug_history` redirects.

## Images and legal compliance

No manufacturer or retailer image is copied without written permission. Every stored image records where it came from and under what license.

| Source | How it's used | `images.source` |
| --- | --- | --- |
| User photos of their own gear | Main source; uploader grants a license in the terms of service | `user_upload` |
| Brand-provided images | Only with written permission, stored with the agreement reference | `brand_provided` |
| Creative Commons images (e.g. Wikimedia Commons) | Shown with the required attribution | `cc` |
| Affiliate API images | Hotlinked only, never stored, refreshed as each program's terms require | not stored |
| Generic category illustrations | Our own drawings, used when no photo exists | `house` |

Upload handling:

- Strip EXIF metadata, especially GPS location, before storing.
- Resize to standard sizes and reject non-image files and oversized uploads.
- New images start as `pending` in the moderation queue. Only the uploader sees a photo until an admin approves it.

Before launch (legal checklist):

- [ ] Terms of service with a content license from users, acceptable use rules and a repeat-infringer policy
- [ ] Privacy policy, 13+ age gate at sign-up, account deletion and data export (GDPR if EU users are allowed)
- [ ] DMCA designated agent registered with the U.S. Copyright Office and listed on a /dmca page (renew every 3 years)
- [ ] Admin takedown workflow: log the notice, remove the content, notify the uploader, handle counter-notices
- [ ] Brand names used only to identify products; no brand logos in our own branding
- [ ] Affiliate disclosures on any page with affiliate links
- [ ] One-hour review of the above with an IP / internet lawyer

## Milestones

Nine milestones, built in order. Each ends with something you can click through and a set of acceptance criteria Claude Code checks before moving on. Milestones 3, 3b and 4 are the heart of the product, so expect them to take the longest.

The site is publicly reachable throughout development, and anyone who finds it is welcome to try it. Finishing M7 does not trigger launch, which here means announcing the site. At that point, review whether the product is polished enough, then set the launch timeline or add more work.

### M0 — Foundation

Repo, tooling, database, auth and deploy pipeline.

- [x] Next.js + TypeScript (strict) app on the current Node LTS, with exact versions pinned, Tailwind and shadcn/ui set up, and lint, format and type-check scripts
- [x] Drizzle connected to Postgres, first migration runs, seed script exists
- [x] Shared Nginx moved out of `gehsekky/pansori` into an `edge` stack in `gehsekky-infra`, with an external `edge` Docker network and a site file per app; mysignalchain.com served over HTTPS with a certificate on the existing renewal timer; tested that stopping this app doesn't stop Nginx or Pansori, and that this app survives a Pansori deploy
- [x] Nightly `pg_dump` to S3 and EBS snapshots running, and a restore tested
- [x] Sign up and sign in with Google through Better Auth; required onboarding step for a unique handle, following the handle format and blocklist, and the 13+ check
- [x] CI runs lint, type-check, unit and end-to-end tests on every push
- [x] Deploy from `main` on mysignalchain.com: ARM image built in CI, pushed to ECR, started through SSM, health checked, with rollback to the previous image tag pulled from ECR; Pansori stays up throughout, apart from the one brief outage when the proxy moves
- [x] AWS foundation added to gehsekky-infra: Route 53 zone with nameservers delegated from Porkbun (a `mysignalchain_name_servers` output, like the existing ones), ECR repository, S3 buckets, CloudFront and ACM certificate for images, data volume, swap, instance role permissions, AWS Budgets alert, OIDC deploy role
- [x] Rate limits on auth endpoints active from the first deploy, using Better Auth's rate limiter with its in-memory storage, which resets on restart
- [x] Until launch, every page sends `noindex` and shows a small banner saying this is a beta and data may be wiped
- [ ] Draft privacy policy at `/privacy`, linked from a footer and the sign-in page, live with the first deploy (Google's consent screen links to it). It describes what the app does today: Google name, email and picture; handle; the 13+ result, not the birth date; a session cookie; each sign-in session's IP address and browser, deleted with the session (a scheduled job removes expired sessions); Google's access token stored encrypted and its ID token not stored, since the app never calls Google after sign-in; no ads, analytics or trackers; hosted on AWS in the US with backups kept 30 days; beta data may be wiped; deletion on request by email until self-service deletion arrives; not for under-13s. The final version comes in M7
- [x] Local development runs against a local Postgres (Docker) on Ubuntu in WSL2; `CLAUDE.md` notes the environment so Claude Code uses bash, not PowerShell

### M1 — Gear catalog

Brands, categories and gear items with ports, browsable and searchable.

- [ ] Seed data: about 50 common items across pedals, amps, cabs, guitars and utilities, each with a role, audio, control, MIDI and power ports and port paths, including empty-jack paths, shared jacks and speaker levels and impedance where they apply, with a few power supplies (Truetone CS6 and CS12, Voodoo Lab Pedal Power), a power doubler and polarity reverser, an expression pedal, a modeler, a combo amp and a microphone
- [ ] Gear page at `/gear/{brand}/{model}` with images, ports and specs
- [ ] Search by brand and model with typo tolerance (Postgres trigram)
- [ ] Signed-in users can submit a new item; it stays `pending` until an admin approves it
- [ ] Admin can merge duplicates; old URLs redirect to the merged item

### M2 — Collections and images

Users record the gear they own and upload photos.

- [ ] Basic profile page at `/u/{handle}`, and a handle-change screen with `handle_history` redirects and the 30-day limit
- [ ] Add, edit and remove owned gear with nickname, mods, notes and status (owned / sold / wishlist)
- [ ] Collection shown on the profile page, respecting each item's visibility
- [ ] Photo upload to S3 through presigned URLs with EXIF stripped, resized variants and moderation status
- [ ] Every image stores source, license and attribution, and attribution displays where required
- [ ] Only the uploader sees a photo until an admin approves it
- [ ] Before uploads go live: DMCA designated agent registered, short draft terms published and a takedown contact listed

### M3 — Signal chain editor and versions

The core: build a chain as a graph and save versions.

- [ ] `lib/graph` module with validation, cycle check through port paths, signal ordering and auto-layout, all unit tested
- [ ] Editor: add gear from the catalog or your collection, add custom nodes from a template with editable ports, connect ports by dragging, edit settings and notes, bypass a node
- [ ] Invalid connections are blocked with a clear message; warnings (mono/stereo, MIDI type, voltage, polarity, power budget, speaker level, missing load, impedance, missing source or destination, unconnected gear) are shown but allowed; the power panel shows current used per supply output
- [ ] Save creates a new immutable version with an optional changelog; earlier versions stay viewable
- [ ] Each node stores a `gear_snapshot`; integration tests confirm an old version still renders after its catalog ports are renamed, its item is merged, or its owned gear is edited or removed
- [ ] "Update gear data" offered when catalog data has changed, matching ports by key and flagging cables that no longer fit; applies in the next saved version
- [ ] Editor shows that nickname and mods will be public on a public chain
- [ ] Moving boxes saves the layout without creating a version; saving a version always stores a layout, calculated in the editor
- [ ] Fork someone's public chain into your own account, keeping a link to the source version and dropping `owned_gear_id`, nickname and mods
- [ ] Test fixtures cover: straight chain, amp with an empty FX loop, amp FX loop, 4-cable method, stereo rig, A/B split, wet/dry split and merge, reorderable switcher, cross-wired switcher loops, MIDI-switched board, expression pedal on a shared MIDI/EXP jack, TRS insert, board on an isolated supply with one output over budget, power doubler and reverser, pedalboard only, custom guitar, combo amp, mic'd cab into an interface, speaker output into a pedal, head with no load, and an intentional feedback loop (blocked)
- [ ] Routing models (fixed, loop_switcher, channels, switch, programmable) and the derived loop tree with parallel branches and flat-list fallback, unit tested on all fixtures including the split 4-cable modeler
- [ ] Every version has a default scene; a switcher's engaged loops and order, an amp's channel and an A/B/Y position can be set in it

### M3b — Scenes

Multiple named presets per version, for switcher and modeler users.

- [ ] Add, rename, reorder and delete scenes; non-default scenes store only their differences
- [ ] Scene editor: engage and reorder switcher loops, pick channels and switch positions, override settings, record MIDI program changes
- [ ] Effective path recomputed per scene; disengaged loops dimmed; warning when a scene has no path to the destination
- [ ] Scene picker on the chain page and in the mobile list view; the list includes an "Also on this board" section
- [ ] Pinned links can include a scene (`/c/{publicId}/v/{n}?scene=lead`) and preview images render that scene

### M4 — Public pages and sharing

Share links that look great anywhere they're pasted.

- [ ] Routes from the share links section, with visibility rules (private returns 404)
- [ ] Server-rendered SVG viewer and mobile list view; no editor code loaded on public pages
- [ ] At the start of this milestone, or earlier if convenient, next/og is tested against a large graph; if it can't draw it, cards use the sharp SVG-to-PNG fallback
- [ ] Per-version preview images, cached on disk and checked against the policy module on every request, so they stop right away when a chain is taken down, deleted or made private, and refresh when it's renamed or its owner's handle changes; correct title, description and image metadata
- [ ] Share button copies the short link; version page offers the pinned link
- [ ] Sitemap includes public chains and approved gear; unlisted pages are `noindex`
- [ ] Public chain page loads with good performance on a mid-range phone (see engineering standards)

### M5 — Reviews and comments

Rated reviews and threaded comments on gear items and chain versions.

- [ ] Post, edit and delete reviews and replies; markdown rendered safely (no raw HTML)
- [ ] One rated review per user per target; replies unlimited
- [ ] Logged-out visitors see counts and average only; an end-to-end test confirms review text is absent from the logged-out page and API response
- [ ] Chain page links to reviews on earlier versions
- [ ] Rate limits on posting

### M6 — Social

Follow people and see what they're building.

- [ ] Follow and unfollow; follower and following lists on profiles
- [ ] Simple feed of new chains and versions from people you follow
- [ ] Email notification when someone reviews your chain (with an opt-out)
- [ ] SES identity with DKIM, MAIL FROM, SPF and DMARC records added to gehsekky-infra, and SES production access granted

### M7 — Trust, safety and launch

Everything needed to open the doors.

- [ ] Report button on chains, reviews, images and gear; admin queue to resolve reports
- [ ] DMCA takedown workflow and /dmca page live, with the designated agent registered in M2 listed; a takedown hides a version right away; the version can be restored after a counter-notice and is permanently deleted if the takedown stands
- [ ] Final terms, privacy policy, account deletion and data export; integration tests cover account deletion with forks, reviews and replies
- [ ] Lawyer review confirms the account deletion rules, including removing other people's reviews on a deleted user's chains and holding deleted users' handles for 90 days
- [ ] Error monitoring, a repeat of the backup restore test, uptime check
- [ ] Legal checklist in the images section complete
- [ ] At launch: remove `noindex` and the beta banner; the sitemap and search visibility rules take effect

## Engineering standards

These rules apply to every milestone. Claude Code should treat them as requirements, not suggestions.

**Code**

- TypeScript strict, no `any` without a comment explaining why.
- Validate every input at the boundary with Zod: forms, API routes, server actions, uploaded graph data.
- Keep domain logic (graph, permissions, versioning) in plain modules under `lib/`, separate from UI and database code.
- Database changes only through committed migrations.

**Security and privacy**

- All permission checks go through one policy module (`canViewChain`, `canEditChain`, `canReadReviews` and so on). No ad hoc checks in pages.
- Private content returns 404 to anyone without access.
- Rate-limit sign-in, sign-up, posting, uploads and catalog submissions. Better Auth covers its own auth endpoints; the rest need our own limiter.
- Render user text as sanitized markdown; never render raw HTML.
- No secrets in the repo; use environment variables per environment.

**Testing**

- Unit tests for `lib/graph` (validation, cycles, ordering, layout, loop tree, scenes) and the policy module.
- Integration tests against a real Postgres for versioning, immutability and review constraints.
- Playwright tests for the critical path: sign up → build a chain → save a version → share → open the link logged out (graph visible, review text absent) → sign up → read and post a review. Tests use a test-only sign-in that is never enabled in production, because automated browsers can't reliably sign in to real Google accounts.

**Performance**

- Public chain pages are server rendered, with no editor JavaScript.
- Target on a mid-range phone: Largest Contentful Paint under 2.5 seconds on a public chain page.
- Images served resized from storage, never full-size originals.

**SEO**

- Every public chain and gear page has a unique title, description and preview image.
- Canonical URL for a chain is its readable latest URL; pinned version pages canonicalize to themselves.
- Sitemap regenerated as public content changes.
- All of the above applies from launch. Until then, every page sends `noindex` (see M0).

## Open decisions

Each can wait until the milestone that needs it.

| Decision | Default in this plan | Needed by |
| --- | --- | --- |
| Public contact email (privacy requests, later takedowns) | None yet; possibly a dedicated Gmail account. The draft privacy page needs it | M0, before Google sign-in is used on mysignalchain.com |
| Add email link sign-in before launch? | Decide at the polish review; if added, add a CAPTCHA with it to protect SES from bot sign-ups | M7 |
| Catalog seeding source | Hand-entered starter set, then user submissions | M1 |
| Does moving boxes create a version? | No, layout is separate | M3 |
| How detailed are knob settings? | Optional per-item control schema, free text otherwise | M3 |
| Show reviews from earlier versions on the latest page? | Counts and links only | M5 |
| Rating scale | 1–5 stars | M5 |
| Follows only, or mutual friends too? | Follows in MVP, friends later | M6 |
| Moderation: who reviews the queue? | You, with admin tools | M7 |
| Monetization | Affiliate links on gear pages after launch | After M7 |

# klipper-mainpage

`klipper-mainpage` is a Mainsail-style web interface for Klipper/Moonraker deployments that need organization-level access control.

This project exists for setups where a printer is shared across a lab, school, makerspace, or similar environment and the operator needs more than a single trusted UI. The codebase adds permission levels, account management, audit logging, branded operator content, and policy controls around a Klipper printer without exposing raw Moonraker access to every user.

It is, in practical terms, a clone project in the Mainsail family of interfaces. It is not affiliated with, endorsed by, or impersonating Mainsail. The point here is not to replace upstream Mainsail or Fluidd for normal single-owner printers; it is to add institutional control surfaces that those projects are not trying to be. If you run your own printer and do not need organization-level permissions, groups, audit logs, or sign-up restrictions, you should keep using Mainsail or Fluidd.

## What It Adds

- Group-based permissions for anonymous users, guests, admins, and custom groups
- Self-signup accounts with domain restrictions, email verification, and proof-of-work anti-spam
- Audit logging for administrative and security-sensitive actions
- IP and GeoIP-based access restrictions
- Admin-managed branding, warning content, footer links, and localized operator pages
- Pending-upload review flow for OctoPrint-compatible slicer uploads
- A Moonraker proxy layer that centralizes policy enforcement and websocket fan-out

## Stack

- Frontend: React, TypeScript, Vite, SCSS
- Backend: Rust, Axum, Tokio, SQLite
- Printer API: Moonraker / Klipper

## Repository Layout

```text
backend/   Rust backend, config, content, runtime assets
frontend/  React application and frontend tests
LICENSE    GNU AGPL v3
ATTRIBUTIONS.md
Makefile
```

## Development

Prerequisites:

- Rust and Cargo
- Node.js and npm

Typical local workflow:

```bash
make install
make dev
```

Other useful commands:

```bash
make build
make test
make lint
```

The backend reads runtime state from `backend/` by default during local development. For deployments that should keep runtime data outside the source checkout, set:

- `KLIPPER_PORTAL_HOME` for `config.toml`, `content/`, `data/`, and uploaded assets
- `KLIPPER_PORTAL_FRONTEND_DIST` for the built frontend directory

## Deployment Notes

This project is intended to sit in front of Moonraker, not beside it as an equal-trust client. Treat it as the policy boundary for shared environments. The backend exposes the UI, proxies printer operations, enforces per-group capability checks, and stores local account and audit state in SQLite.

The repository currently includes institution-specific branding assets and content defaults. Review those before any public or third-party deployment.

## Documentation

Operational documentation belongs in the companion GitHub wiki for this project. The wiki should cover installation, configuration, permissions, and legal/provenance notes rather than duplicating this README.

## License

The software in this repository is free software licensed under the GNU Affero General Public License, version 3 or later. See [LICENSE](/home/therealone/git/klipper-mainpage/LICENSE) for the canonical license text.

Not every bundled asset is necessarily covered by the same terms. Branding assets, fonts, and third-party media have their own provenance and usage constraints. See [ATTRIBUTIONS.md](/home/therealone/git/klipper-mainpage/ATTRIBUTIONS.md) for details.

## Provenance

This repository was developed with LLM-assisted, vibe-coded workflows. That is a statement about how it was produced, not a substitute for engineering review. Treat it like any other system that controls real hardware: read the code, review the policies, and test the deployment you intend to trust.

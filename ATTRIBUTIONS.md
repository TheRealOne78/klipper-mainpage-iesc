# Attributions and Provenance

This repository contains software, data, and assets with different provenance. The software is licensed under the GNU Affero General Public License, version 3 or later, but some bundled assets and datasets carry their own attribution or redistribution requirements.

## Project Positioning

- This project is a clone-style interface in the Mainsail ecosystem.
- It is not affiliated with, endorsed by, or presented as Mainsail.
- It exists to add organization-level permissions, policy controls, and operational restrictions for shared printers.
- If you do not need those controls, use upstream Mainsail or Fluidd instead.

## LLM-Assisted Development

The repository was developed with LLM-assisted, vibe-coded workflows. That statement is included for provenance, not as a quality claim or liability waiver.

## Bundled Assets and Data

- `frontend/src/assets/Creality Ender-3 Pro_cover.png` and related printer-cover usage:
  sourced from OrcaSlicer project materials. Review upstream licensing before redistributing outside this repository's current context.
- `frontend/src/assets/fonts/UTSans/*`:
  institution-specific font files. Do not assume they are generally redistributable outside the intended deployment context.
- `frontend/src/assets/unitbv/*` and other institution branding assets:
  trademarks and logos belong to their respective owners. They are not an open trademark grant.
- `frontend/src/components/BrandIcons.tsx`:
  embedded brand-mark path data derived from Simple Icons, which publishes the mark data under CC0.
- `frontend/src/lib/cities-data/*`:
  city data is surfaced in the UI with GeoNames attribution and should continue to preserve that attribution where required.

## Operator Responsibility

This application can control real hardware through Moonraker and Klipper. Anyone deploying it should review the permission model, safety limits, localized operating rules, and legal notices before allowing real users onto a printer.

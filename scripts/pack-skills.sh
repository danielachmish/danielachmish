#!/usr/bin/env bash
# Package each Claude skill in .claude/skills as a zip for uploading to a Claude account.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf skills-zip && mkdir skills-zip
(cd .claude/skills && for s in */; do zip -qr "../../skills-zip/${s%/}.zip" "${s%/}"; done)
ls skills-zip

#!/usr/bin/env bash
# Package each Claude skill in .claude/skills as a zip for uploading to a Claude account.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf skills-zip && mkdir skills-zip
(cd .claude/skills && for s in */; do zip -qr "../../skills-zip/${s%/}.zip" "${s%/}"; done)
ls skills-zip

# One combined zip with all skills, and one combined Markdown file with everything.
(cd .claude/skills && zip -qr ../../skills-zip/ALL-skills.zip .)
OUT=skills-zip/CLAUDE_PLAYBOOK_ALL.md
{
  echo "# Claude Playbook – all skills in one file"
  echo
  echo "Generated $(date +%F) from .claude/skills. Start every request with the **operator** section; it routes to the others."
  echo
  for d in operator user-mode $(ls .claude/skills | grep -vE '^(operator|user-mode)$'); do
    echo; echo "---"; echo
    sed '/^---$/,/^---$/d' ".claude/skills/$d/SKILL.md" | sed "1s/^/<!-- skill: $d -->\n/"
    if [ -d ".claude/skills/$d/references" ]; then
      for r in .claude/skills/$d/references/*.md; do echo; echo "### Reference: $(basename "$r" .md)"; echo; sed 's/^# /#### /' "$r"; done
    fi
  done
} > "$OUT"
echo "combined: $OUT ($(wc -w < "$OUT") words)"

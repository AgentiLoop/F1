#!/bin/zsh
# Publish the committed main branch to f1.gokart.games. `git archive` exports a clean
# tree and stamps src/version.mjs with the git describe string (export-subst).
set -e
cd "${0:A:h}/.."
rm -rf /tmp/f1_deploy && mkdir -p /tmp/f1_deploy
git archive main | tar -x -C /tmp/f1_deploy
cd /tmp/f1_deploy && npx wrangler@4 deploy

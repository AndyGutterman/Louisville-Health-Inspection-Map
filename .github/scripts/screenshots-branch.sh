#!/usr/bin/env bash
# Keeps end-to-end screenshots on the `e2e-screenshots` branch, so PR comments can show
# them inline (raw.githubusercontent.com links render because the repo is public).
#
#   screenshots-branch.sh publish <pr-number> <folder> <source-dir>
#       Replaces pr-<number>/ with <source-dir> copied to pr-<number>/<folder>/.
#   screenshots-branch.sh remove <pr-number>
#       Deletes pr-<number>/ (run when the PR closes).
#
# The branch is always one commit with no history, so replaced screenshots don't pile
# up in the repository. If another run updates the branch at the same moment, the push
# is refused (--force-with-lease) and this retries from the new state.
#
# Needs GITHUB_TOKEN (contents: write) and GITHUB_REPOSITORY. For testing, set
# SCREENSHOTS_REMOTE to another git URL (for example a local bare repository).
set -euo pipefail

BRANCH=e2e-screenshots
action=${1:?usage: publish <pr> <folder> <dir> | remove <pr>}
pr=${2:?pr number required}
if [ "$action" = publish ]; then
  folder=${3:?folder name required}
  src=$(cd "${4:?source directory required}" && pwd)
fi
remote=${SCREENSHOTS_REMOTE:-"https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"}
work=$(mktemp -d)

for attempt in 1 2 3; do
  cd /
  rm -rf "$work" && mkdir -p "$work" && cd "$work"
  git init -q
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

  # Start from the branch's current files, if it exists yet.
  base=$(git ls-remote "$remote" "refs/heads/$BRANCH" | cut -f1)
  if [ -n "$base" ]; then
    git fetch -q --depth=1 "$remote" "refs/heads/$BRANCH"
    git checkout -q FETCH_HEAD -- . 2>/dev/null || true # fails only on an empty tree
  elif [ "$action" = remove ]; then
    echo "No $BRANCH branch yet, so nothing to remove."
    exit 0
  fi

  rm -rf "pr-$pr"
  if [ "$action" = publish ]; then
    mkdir -p "pr-$pr/$folder"
    cp -R "$src"/. "pr-$pr/$folder"/
  fi

  git checkout -q --orphan snapshot
  git add -A
  git commit -q --allow-empty -m "e2e screenshots: $action PR #$pr"
  if git push -q --force-with-lease="refs/heads/$BRANCH:$base" "$remote" "HEAD:refs/heads/$BRANCH"; then
    echo "Updated $BRANCH: $action PR #$pr."
    exit 0
  fi
  echo "$BRANCH changed while this run was updating it; retrying ($attempt/3)."
  sleep $((attempt * 5))
done

echo "::warning::Couldn't update the $BRANCH branch after 3 tries."
exit 1

#!/usr/bin/env bash
# Publish the version in package.json as a GitHub release tagged v<version>.
# Run on synced main right after the PR that bumped the version merged.
# The release notes list the commit subjects since the previous tag, in English and (from "Es:" trailers) Spanish.
# Safe to rerun: reuses a tag already on HEAD and re-uploads a missing asset.
# usage: pnpm release
set -euo pipefail

die() { echo "release: $*" >&2; exit 1; }

version=$(node -p "require('./package.json').version")
tag="v$version"
asset_name="test-cli-$version.tgz"

gh auth status >/dev/null 2>&1 || die "gh is not logged in (gh auth login)"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "switch to main first"
[ -z "$(git status --porcelain)" ] || die "working tree is not clean"
git fetch -q origin main --tags || die "git fetch failed (a local tag may conflict with origin; check git tag -l $tag)"
head=$(git rev-parse HEAD)
[ "$head" = "$(git rev-parse origin/main)" ] || die "main is not level with origin/main (git pull --ff-only)"

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

# The squash commit that set this version; later commits may only touch docs.
# Only the top-level "version" (two-space indent), not devEngines.packageManager.version.
bump_commit=$(git log -1 --format=%H -G'^  "version":' -- package.json)
shipped_changes=$(git diff --name-only "$bump_commit" HEAD -- src package.json pnpm-lock.yaml tsconfig.json README.md)
[ -z "$shipped_changes" ] ||
  die "code changed after the $tag bump ($shipped_changes); those changes need their own version bump"

# Notes: one bullet per commit since the previous tag (squash subjects end with "(#PR)"), in English and Spanish.
# The Spanish line comes from the commit's "Es:" trailer; a commit without one falls back to its English subject.
notes="$out/notes.md"
previous=$(git describe --tags --abbrev=0 "$bump_commit^" 2>/dev/null || true)
range="${previous:+$previous..}HEAD"
changes=$(git log --no-merges --format='- %s' "$range")
[ -n "$changes" ] || die "no commits since $previous"
cambios=""
missing=0
while IFS=$'\x1f' read -r subject es; do
  # A trailer ends with its own newline, which leaves an empty line between commits.
  [ -n "$subject" ] || continue
  pr=$(grep -oE ' \(#[0-9]+\)$' <<<"$subject" || true)
  if [ -z "$es" ]; then
    es="$subject"
    missing=$((missing + 1))
  else
    es="$es$pr"
  fi
  cambios+="- $es"$'\n'
done < <(git log --no-merges --format='%s%x1f%(trailers:key=Es,valueonly,separator=%x20)' "$range")
# Strip the last newline here: $'…' quoting does not work inside the heredoc below.
cambios=${cambios%$'\n'}
[ "$missing" -eq 0 ] || echo "release: $missing commit(s) have no Es: trailer; their Spanish line repeats the English subject" >&2
cat >"$notes" <<NOTES
# English

## What's changed

$changes

## Install or update

You need [Node.js](https://nodejs.org) 24 or newer.

\`\`\`sh
curl -fsSL https://raw.githubusercontent.com/chrisvasqm/test-cli/main/install.sh | sh
\`\`\`

On Windows (PowerShell):

\`\`\`powershell
irm https://raw.githubusercontent.com/chrisvasqm/test-cli/main/install.ps1 | iex
\`\`\`

To install exactly this version: \`npm install -g https://github.com/chrisvasqm/test-cli/releases/download/$tag/$asset_name\`

---

# Español

## Cambios

$cambios

## Instalar o actualizar

Necesita [Node.js](https://nodejs.org) 24 o una versión más reciente.

\`\`\`sh
curl -fsSL https://raw.githubusercontent.com/chrisvasqm/test-cli/main/install.sh | sh
\`\`\`

En Windows (PowerShell):

\`\`\`powershell
irm https://raw.githubusercontent.com/chrisvasqm/test-cli/main/install.ps1 | iex
\`\`\`

Para instalar exactamente esta versión: \`npm install -g https://github.com/chrisvasqm/test-cli/releases/download/$tag/$asset_name\`
NOTES
if tagged=$(git rev-parse -q --verify "refs/tags/$tag^{commit}"); then
  [ "$tagged" = "$head" ] || die "$tag exists on another commit; bump the version in the PR first"
fi

# Release state: none, complete (asset present), partial (asset missing), or draft (left by a failed run).
state=none
if lookup=$(gh api "repos/{owner}/{repo}/releases/tags/$tag" --jq '[.assets[].name] | join(" ")' 2>&1); then
  case " $lookup " in
    *" $asset_name "*) die "release $tag is already published; bump the version in the PR first" ;;
    *) state=partial ;;
  esac
else
  case "$lookup" in
    *"HTTP 404"*)
      # releases/tags/{tag} never returns drafts, so look for one by listing.
      draft=$(gh release list --limit 100 --json tagName,isDraft --jq ".[] | select(.isDraft and .tagName == \"$tag\") | .tagName")
      [ -z "$draft" ] || state=draft
      ;;
    *) die "could not check release $tag: $lookup" ;;
  esac
fi

pnpm install --frozen-lockfile >&2 || die "pnpm install failed"
rm -rf dist
pnpm check >&2 || die "pnpm check failed (output above)"

pnpm pack --pack-destination "$out" >/dev/null
tarball=$(ls "$out"/*.tgz)
listing=$(tar -tzf "$tarball")
unexpected=$(grep -vE '^package/(package\.json|README\.md|LICEN[CS]E(\.md)?|dist/.+\.(js|d\.ts|js\.map))$' <<<"$listing" || true)
[ -z "$unexpected" ] || die "tarball has unexpected files: $unexpected"
grep -qx 'package/dist/index.js' <<<"$listing" || die "tarball is missing dist/index.js"
# dist/index.js is bundled, so the package must not ask npm to resolve anything at install time.
tar -xzOf "$tarball" package/package.json | node -e '
  const pkg = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (Object.keys(pkg.dependencies ?? {}).length) process.exit(1);
' || die "package.json has runtime dependencies; dist/index.js must bundle them"
asset="$out/$asset_name"
[ "$tarball" = "$asset" ] || mv "$tarball" "$asset"
# Same file under a fixed name, so releases/latest/download/test-cli.tgz always installs the newest version.
stable="$out/test-cli.tgz"
cp "$asset" "$stable"
# Install links from before the rename (releases/latest/download/testrail-cli.tgz) keep working.
legacy="$out/testrail-cli.tgz"
cp "$asset" "$legacy"
legacy_checksum="$out/testrail-cli.tgz.sha256"
(cd "$out" && shasum -a 256 testrail-cli.tgz >"$legacy_checksum")
# Checksum of the stable asset, which install.sh and install.ps1 verify before installing.
checksum="$out/test-cli.tgz.sha256"
(cd "$out" && shasum -a 256 test-cli.tgz >"$checksum")
printf '\nSHA-256 of `%s`: `%s`\n' "$asset_name" "$(cut -d' ' -f1 "$checksum")" >>"$notes"

git rev-parse -q --verify "refs/tags/$tag" >/dev/null || git tag -a "$tag" -m "test-cli $tag"
git push -q origin "$tag"
if [ "$state" != none ]; then
  gh release upload "$tag" "$asset" "$stable" "$checksum" "$legacy" "$legacy_checksum" --clobber
  gh release edit "$tag" --notes-file "$notes" --draft=false >/dev/null
  echo "uploaded the assets and refreshed the notes of existing $state release $tag"
else
  gh release create "$tag" "$asset" "$stable" "$checksum" "$legacy" "$legacy_checksum" --verify-tag --title "test-cli $tag" --notes-file "$notes"
fi

#!/bin/sh
# Install or update testrail-cli to the latest release:
#   curl -fsSL https://raw.githubusercontent.com/chrisvasqm/testrail-cli/main/install.sh | sh
# It downloads the release tarball, checks its SHA-256 against the release's checksum file,
# then installs it with npm. Source: https://github.com/chrisvasqm/testrail-cli
set -eu

base="https://github.com/chrisvasqm/testrail-cli/releases/latest/download"

fail() {
  echo "testrail-cli: $*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "needs Node.js 24 or newer; install it from https://nodejs.org"
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 24 ] || fail "needs Node.js 24 or newer (found $(node -v)); update it from https://nodejs.org"
command -v npm >/dev/null 2>&1 || fail "needs npm, which comes with Node.js"
command -v curl >/dev/null 2>&1 || fail "needs curl"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading the latest testrail-cli..."
curl -fsSL "$base/testrail-cli.tgz" -o "$tmp/testrail-cli.tgz" || fail "download failed"
# Every release ships the checksum, so a missing file or tool stops the install instead of skipping the check.
curl -fsSL "$base/testrail-cli.tgz.sha256" -o "$tmp/testrail-cli.tgz.sha256" || fail "could not download the checksum file; nothing was installed"
if command -v shasum >/dev/null 2>&1; then
  (cd "$tmp" && shasum -a 256 -c testrail-cli.tgz.sha256 >/dev/null) || fail "checksum mismatch; the download was not installed"
elif command -v sha256sum >/dev/null 2>&1; then
  (cd "$tmp" && sha256sum -c testrail-cli.tgz.sha256 >/dev/null) || fail "checksum mismatch; the download was not installed"
else
  fail "needs shasum or sha256sum to verify the download"
fi

npm install -g "$tmp/testrail-cli.tgz" >/dev/null || fail "npm install failed (see the error above)"

# Report the binary npm just installed, not whichever testrail comes first on PATH.
bin="$(npm prefix -g)/bin"
echo "Installed testrail $("$bin/testrail" -v). Run 'testrail setup' in your project directory to connect it to TestRail."
if [ "$(command -v testrail 2>/dev/null)" != "$bin/testrail" ]; then
  echo "Note: 'testrail' on your PATH is not $bin/testrail. Put $bin first in PATH, or remove the other install." >&2
fi

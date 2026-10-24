#!/bin/sh
# Install or update test-cli to the latest release:
#   curl -fsSL https://raw.githubusercontent.com/chrisvasqm/test-cli/main/install.sh | sh
# It downloads the release tarball, checks its SHA-256 against the release's checksum file,
# then installs it with npm. Source: https://github.com/chrisvasqm/test-cli
set -eu

base="https://github.com/chrisvasqm/test-cli/releases/latest/download"

fail() {
  echo "test-cli: $*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "needs Node.js 24 or newer; install it from https://nodejs.org"
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 24 ] || fail "needs Node.js 24 or newer (found $(node -v)); update it from https://nodejs.org"
command -v npm >/dev/null 2>&1 || fail "needs npm, which comes with Node.js"
command -v curl >/dev/null 2>&1 || fail "needs curl"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading the latest test-cli..."
curl -fsSL "$base/test-cli.tgz" -o "$tmp/test-cli.tgz" || fail "download failed"
# Every release ships the checksum, so a missing file or tool stops the install instead of skipping the check.
curl -fsSL "$base/test-cli.tgz.sha256" -o "$tmp/test-cli.tgz.sha256" || fail "could not download the checksum file; nothing was installed"
if command -v shasum >/dev/null 2>&1; then
  (cd "$tmp" && shasum -a 256 -c test-cli.tgz.sha256 >/dev/null) || fail "checksum mismatch; the download was not installed"
elif command -v sha256sum >/dev/null 2>&1; then
  (cd "$tmp" && sha256sum -c test-cli.tgz.sha256 >/dev/null) || fail "checksum mismatch; the download was not installed"
else
  fail "needs shasum or sha256sum to verify the download"
fi

# The package was called testrail-cli before 3.0.0; remove it so its old testrail command does not linger.
removed_old=""
if npm ls -g --depth=0 testrail-cli >/dev/null 2>&1; then
  npm uninstall -g testrail-cli >/dev/null || fail "could not remove the old testrail-cli package"
  removed_old=" The old testrail-cli was already removed; fix the error and run this script again."
fi
npm install -g "$tmp/test-cli.tgz" >/dev/null || fail "npm install failed (see the error above).$removed_old"

# Report the binary npm just installed, not whichever test-cli comes first on PATH.
bin="$(npm prefix -g)/bin"
echo "Installed test-cli $("$bin/test-cli" -v). Run 'test-cli setup' in your project directory to connect it to TestRail."
if [ "$(command -v test-cli 2>/dev/null)" != "$bin/test-cli" ]; then
  echo "Note: 'test-cli' on your PATH is not $bin/test-cli. Put $bin first in PATH, or remove the other install." >&2
fi

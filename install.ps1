# Install or update test-cli to the latest release (Windows PowerShell 5.1+ or PowerShell 7+):
#   irm https://raw.githubusercontent.com/chrisvasqm/test-cli/main/install.ps1 | iex
# It downloads the release tarball, checks its SHA-256 against the release's checksum file,
# then installs it with npm. Source: https://github.com/chrisvasqm/test-cli
$ErrorActionPreference = "Stop"

$base = "https://github.com/chrisvasqm/test-cli/releases/latest/download"

function Fail([string]$message) {
  Write-Host "test-cli: $message" -ForegroundColor Red
  # `exit` would close the window when run through `irm | iex`, so stop with an error instead.
  throw "test-cli: $message"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "needs Node.js 24 or newer; install it from https://nodejs.org" }
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 24) { Fail "needs Node.js 24 or newer (found $(node -v)); update it from https://nodejs.org" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "needs npm, which comes with Node.js" }

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("test-cli-" + [System.Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  # Windows PowerShell 5.1 may default to TLS 1.0, which GitHub refuses.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $tarball = Join-Path $tmp "test-cli.tgz"
  $checksumFile = Join-Path $tmp "test-cli.tgz.sha256"

  Write-Host "Downloading the latest test-cli..."
  try { Invoke-WebRequest -UseBasicParsing -Uri "$base/test-cli.tgz" -OutFile $tarball } catch { Fail "download failed" }
  # Every release ships the checksum, so a missing file stops the install instead of skipping the check.
  try { Invoke-WebRequest -UseBasicParsing -Uri "$base/test-cli.tgz.sha256" -OutFile $checksumFile } catch {
    Fail "could not download the checksum file; nothing was installed"
  }
  # The file is "<hash>  test-cli.tgz", as shasum writes it.
  $expected = ((Get-Content $checksumFile -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 -Path $tarball).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { Fail "checksum mismatch; the download was not installed" }

  # The package was called testrail-cli before 3.0.0; both claim the testrail command, so the old one goes first.
  $removedOld = ""
  npm ls -g --depth=0 testrail-cli | Out-Null
  if ($LASTEXITCODE -eq 0) {
    npm uninstall -g testrail-cli | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "could not remove the old testrail-cli package" }
    $removedOld = " The old testrail-cli was already removed; fix the error and run this script again."
  }
  npm install -g $tarball | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "npm install failed (see the error above).$removedOld" }

  # Report the binary npm just installed, not whichever test-cli comes first on PATH.
  $prefix = (npm prefix -g).Trim()
  $installed = Join-Path $prefix "test-cli.cmd"
  if (-not (Test-Path $installed)) { $installed = Join-Path (Join-Path $prefix "bin") "test-cli" }
  Write-Host "Installed test-cli $(& $installed -v). Run 'test-cli setup' in your project directory to connect it to TestRail."
  $onPath = Get-Command test-cli -ErrorAction SilentlyContinue
  # npm also writes test-cli.ps1 next to test-cli.cmd, and PowerShell picks that one, so compare folders.
  # An alias or function has no Source; that is not the installed binary either.
  if (-not $onPath -or -not $onPath.Source -or (Split-Path -Parent $onPath.Source) -ne (Split-Path -Parent $installed)) {
    Write-Host "Note: 'test-cli' on your PATH is not $installed. Put $prefix first in PATH, or remove the other install." -ForegroundColor Yellow
  }
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

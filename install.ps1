# Install or update testrail-cli to the latest release (Windows PowerShell 5.1+ or PowerShell 7+):
#   irm https://raw.githubusercontent.com/chrisvasqm/testrail-cli/main/install.ps1 | iex
# It downloads the release tarball, checks its SHA-256 against the release's checksum file,
# then installs it with npm. Source: https://github.com/chrisvasqm/testrail-cli
$ErrorActionPreference = "Stop"

$base = "https://github.com/chrisvasqm/testrail-cli/releases/latest/download"

function Fail([string]$message) {
  Write-Host "testrail-cli: $message" -ForegroundColor Red
  # `exit` would close the window when run through `irm | iex`, so stop with an error instead.
  throw "testrail-cli: $message"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "needs Node.js 24 or newer; install it from https://nodejs.org" }
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 24) { Fail "needs Node.js 24 or newer (found $(node -v)); update it from https://nodejs.org" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail "needs npm, which comes with Node.js" }

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("testrail-cli-" + [System.Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  # Windows PowerShell 5.1 may default to TLS 1.0, which GitHub refuses.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $tarball = Join-Path $tmp "testrail-cli.tgz"
  $checksumFile = Join-Path $tmp "testrail-cli.tgz.sha256"

  Write-Host "Downloading the latest testrail-cli..."
  try { Invoke-WebRequest -UseBasicParsing -Uri "$base/testrail-cli.tgz" -OutFile $tarball } catch { Fail "download failed" }
  # Every release ships the checksum, so a missing file stops the install instead of skipping the check.
  try { Invoke-WebRequest -UseBasicParsing -Uri "$base/testrail-cli.tgz.sha256" -OutFile $checksumFile } catch {
    Fail "could not download the checksum file; nothing was installed"
  }
  # The file is "<hash>  testrail-cli.tgz", as shasum writes it.
  $expected = ((Get-Content $checksumFile -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 -Path $tarball).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { Fail "checksum mismatch; the download was not installed" }

  npm install -g $tarball | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "npm install failed (see the error above)" }

  # Report the binary npm just installed, not whichever testrail comes first on PATH.
  $prefix = (npm prefix -g).Trim()
  $installed = Join-Path $prefix "testrail.cmd"
  if (-not (Test-Path $installed)) { $installed = Join-Path (Join-Path $prefix "bin") "testrail" }
  Write-Host "Installed testrail $(& $installed -v). Run 'testrail setup' in your project directory to connect it to TestRail."
  $onPath = Get-Command testrail -ErrorAction SilentlyContinue
  if (-not $onPath -or $onPath.Source -ne $installed) {
    Write-Host "Note: 'testrail' on your PATH is not $installed. Put $prefix first in PATH, or remove the other install." -ForegroundColor Yellow
  }
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

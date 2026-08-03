param(
  [string]$Url = $(if ($env:MORROW_KIOSK_URL) { $env:MORROW_KIOSK_URL } else { "http://localhost:5173" })
)

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chromePath = $chromeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $chromePath) {
  throw "Google Chrome was not found. Install Chrome or update scripts/start-kiosk-chrome.ps1."
}

$chromeArguments = @(
  "--kiosk",
  "--kiosk-printing",
  "--no-first-run",
  "--disable-session-crashed-bubble",
  "--disable-pinch",
  "--overscroll-history-navigation=0",
  $Url
)

# This is the customer-facing kiosk window and must remain visible.
Start-Process -FilePath $chromePath -ArgumentList $chromeArguments

$ErrorActionPreference = 'Stop'
$simPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $simPython)) { $simPython = (Get-Command python -ErrorAction Stop).Source }
$simUrl = 'http://127.0.0.1:8766'
$simRunning = $false
try { $simHealth = Invoke-RestMethod "$simUrl/api/health" -TimeoutSec 2; $simRunning = $simHealth.app -eq 'cable-mvp-simulator' } catch {}
if (-not $simRunning) {
    Start-Process -FilePath $simPython -ArgumentList ('"' + (Join-Path $PSScriptRoot 'server.py') + '" 8766') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'server-8766.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-8766-error.log')
    for ($simAttempt = 0; $simAttempt -lt 20; $simAttempt++) {
        Start-Sleep -Milliseconds 250
        try { $simHealth = Invoke-RestMethod "$simUrl/api/health" -TimeoutSec 1; if ($simHealth.app -eq 'cable-mvp-simulator') { $simRunning = $true; break } } catch {}
    }
}
if (-not $simRunning) { throw 'Server failed to start. Check port 8766 and server-8766-error.log.' }
Start-Process $simUrl

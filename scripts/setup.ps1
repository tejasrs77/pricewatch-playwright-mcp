$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if ([int]((node --version).TrimStart('v').Split('.')[0]) -lt 24) { throw 'Install Node.js 24 or newer first.' }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm.cmd run browser:install
if ($LASTEXITCODE -ne 0) { throw 'Browser installation failed.' }
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
Write-Host 'Ready. Run npm.cmd start and open http://127.0.0.1:3000'

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$nextRoot = Join-Path $repoRoot ".next"
$standaloneRoot = Join-Path $nextRoot "standalone"
$target = Join-Path $repoRoot "deploy"

if (-not (Test-Path -LiteralPath $standaloneRoot)) {
    throw "Standalone build was not found. Run 'npm run build' first."
}

$resolvedParent = (Resolve-Path -LiteralPath $repoRoot).Path
if (-not $target.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Deploy target resolved outside the repository."
}

if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
}

New-Item -ItemType Directory -Path $target | Out-Null
Copy-Item -Path (Join-Path $standaloneRoot "*") -Destination $target -Recurse -Force

$targetStatic = Join-Path $target ".next\static"
New-Item -ItemType Directory -Path $targetStatic -Force | Out-Null
Copy-Item -Path (Join-Path $nextRoot "static\*") -Destination $targetStatic -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repoRoot "public") -Destination (Join-Path $target "public") -Recurse -Force

Write-Host "Deployment package prepared: $target"

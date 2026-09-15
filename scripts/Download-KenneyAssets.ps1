$ErrorActionPreference = 'Stop'
$taskCache = Join-Path $PSScriptRoot '../.asset-cache/kenney'
New-Item -ItemType Directory -Path $taskCache -Force | Out-Null
foreach ($pack in @('factory-kit', 'nature-kit', 'furniture-kit', 'mini-characters')) {
    $pageUrl = 'https://kenney.nl/assets/' + $pack
    $assetPage = Invoke-WebRequest -Uri $pageUrl -UseBasicParsing
    $downloadUrl = ($assetPage.Links | Where-Object { $_.href -match '^https://kenney\.nl/.*\.zip$' } | Select-Object -First 1).href
    if (-not $downloadUrl) { throw "No official ZIP found for $pack" }
    $archivePath = Join-Path $taskCache ($pack + '.zip')
    if (-not (Test-Path -LiteralPath $archivePath)) { Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath }
    $extractPath = Join-Path $taskCache $pack
    if (-not (Test-Path -LiteralPath $extractPath)) { Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath }
    Write-Output "$pack | $downloadUrl | SHA256 $((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash)"
}

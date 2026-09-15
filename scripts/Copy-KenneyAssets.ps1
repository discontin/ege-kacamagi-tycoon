$ErrorActionPreference = 'Stop'
$catalogPath = Join-Path $PSScriptRoot '../src/game/assetCatalog.ts'
$entries = [regex]::Matches((Get-Content -LiteralPath $catalogPath -Raw), "\w+: \['([^']+)', '([^']+)'\]")
foreach ($entry in $entries) {
    $pack = $entry.Groups[1].Value
    $fileName = $entry.Groups[2].Value + '.glb'
    $format = if ($pack -in @('nature-kit', 'furniture-kit')) { 'GLTF format' } else { 'GLB format' }
    $sourceDir = Join-Path $PSScriptRoot "../.asset-cache/kenney/$pack/Models/$format"
    $destination = Join-Path $PSScriptRoot "../public/assets/kenney/$pack"
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceDir $fileName) -Destination (Join-Path $destination $fileName)
    if (Test-Path -LiteralPath (Join-Path $sourceDir 'Textures')) {
        New-Item -ItemType Directory -Path (Join-Path $destination 'Textures') -Force | Out-Null
        Get-ChildItem -LiteralPath (Join-Path $sourceDir 'Textures') -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $destination 'Textures') }
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "../.asset-cache/kenney/$pack/License.txt") -Destination (Join-Path $destination 'License.txt')
}
Write-Output "Copied $($entries.Count) selected models and their licenses."

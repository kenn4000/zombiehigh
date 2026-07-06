param(
    [int]$Count = 1000,
    [ValidateRange(2, 5)]
    [int]$MinPlayerCount = 2,
    [ValidateRange(2, 5)]
    [int]$MaxPlayerCount = 5,
    [ValidateRange(10, 600)]
    [int]$GameTimeoutSec = 10,
    [string]$OutputDir = '.\data',
    [string]$OutputPrefix = 'batch-metrics',
    [switch]$SkipAnalysis
)

$ErrorActionPreference = 'Stop'

if ($MinPlayerCount -gt $MaxPlayerCount) {
    throw 'MinPlayerCount must be less than or equal to MaxPlayerCount.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $repoRoot

try {
    if (-not (Test-Path $OutputDir)) {
        New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null
    }

    $csvFiles = New-Object 'System.Collections.Generic.List[string]'

    for ($pc = $MinPlayerCount; $pc -le $MaxPlayerCount; $pc++) {
        $csvPath = Join-Path $OutputDir ("{0}-{1}p.csv" -f $OutputPrefix, $pc)
        $csvFiles.Add($csvPath)

        Write-Host ("Running batch for {0} players -> {1}" -f $pc, $csvPath)

        & powershell -ExecutionPolicy Bypass -File .\scripts\run-bot-batch.ps1 `
            -Count $Count `
            -PlayerCount $pc `
            -GameTimeoutSec $GameTimeoutSec `
            -OutputCsv $csvPath

        if ($LASTEXITCODE -ne 0) {
            throw ("Batch run failed for player count {0} with exit code {1}." -f $pc, $LASTEXITCODE)
        }
    }

    if (-not $SkipAnalysis) {
        Write-Host 'Running win-variance analysis...'

        $lockerVariancePath = Join-Path $OutputDir ("{0}-locker-card-win-variance.csv" -f $OutputPrefix)
        $heroVariancePath = Join-Path $OutputDir ("{0}-hero-win-variance.csv" -f $OutputPrefix)
        $deckVariancePath = Join-Path $OutputDir ("{0}-deck-card-win-variance.csv" -f $OutputPrefix)

        & .\scripts\analyze-complete-games.ps1 `
            -Files $csvFiles.ToArray() `
            -LockerOutputCsv $lockerVariancePath `
            -HeroOutputCsv $heroVariancePath `
            -DeckOutputCsv $deckVariancePath

        if ($LASTEXITCODE -ne 0) {
            throw ("Analysis failed with exit code {0}." -f $LASTEXITCODE)
        }

        Write-Host 'Analysis complete:'
        Write-Host ("  {0}" -f $lockerVariancePath)
        Write-Host ("  {0}" -f $heroVariancePath)
        Write-Host ("  {0}" -f $deckVariancePath)
    }

    Write-Output 'SUITE_COMPLETE=true'
    Write-Output ("FILES={0}" -f ($csvFiles -join ';'))
}
finally {
    Pop-Location
}

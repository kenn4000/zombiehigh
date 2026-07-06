$ErrorActionPreference = 'Stop'

$base = 'http://localhost:8080'
$players = @(
    @{ name = 'CPU-1'; color = 'red'; isBot = $true; difficultyLevel = 'normal' },
    @{ name = 'CPU-2'; color = 'blue'; isBot = $true; difficultyLevel = 'normal' },
    @{ name = 'CPU-3'; color = 'green'; isBot = $true; difficultyLevel = 'normal' },
    @{ name = 'CPU-4'; color = 'yellow'; isBot = $true; difficultyLevel = 'normal' },
    @{ name = 'CPU-5'; color = 'cyan'; isBot = $true; difficultyLevel = 'normal' }
)

$createBody = @{ players = $players } | ConvertTo-Json -Depth 8
$create = Invoke-RestMethod -Method Post -Uri "$base/api/game" -ContentType 'application/json' -Body $createBody
$gameId = $create.gameId
$pids = @($create.playerUrls | ForEach-Object { $_.playerId })

foreach ($playerPid in $pids) {
    Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$playerPid" -ContentType 'application/json' -Body (@{ type = 'confirm' } | ConvertTo-Json) | Out-Null
}
Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$($pids[0])" -ContentType 'application/json' -Body (@{ type = 'start_game' } | ConvertTo-Json) | Out-Null

$lastSaveId = -1
$stall = 0
$maxSteps = 12000

for ($step = 0; $step -lt $maxSteps; $step++) {
    $spec = Invoke-RestMethod -Method Get -Uri "$base/api/spectator/$gameId"
    if ($spec.phase -eq 'GAME_OVER') { break }

    if ($spec.lastSaveId -eq $lastSaveId) { $stall++ } else { $stall = 0; $lastSaveId = $spec.lastSaveId }

    if ($spec.phase -eq 'SETUP') {
        foreach ($playerPid in $pids) {
            Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$playerPid" -ContentType 'application/json' -Body (@{ type = 'confirm' } | ConvertTo-Json) | Out-Null
        }
        Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$($pids[0])" -ContentType 'application/json' -Body (@{ type = 'start_game' } | ConvertTo-Json) | Out-Null
        Start-Sleep -Milliseconds 80
        continue
    }

    if ($spec.phase -eq 'NIGHT_CHOICE') {
        $nPid = $spec.nightChoicePlayerId
        if ($nPid) {
            Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$nPid" -ContentType 'application/json' -Body (@{ type = 'night_choice'; choice = 'np' } | ConvertTo-Json) | Out-Null
        }
        Start-Sleep -Milliseconds 80
        continue
    }

    if ($spec.phase -eq 'DRAFTING') {
        foreach ($pl in $spec.players) {
            if ($pl.isAlive) {
                Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$($pl.id)" -ContentType 'application/json' -Body (@{ type = 'confirm' } | ConvertTo-Json) | Out-Null
            }
        }
        Start-Sleep -Milliseconds 80
        continue
    }

    $active = $spec.activePlayerId
    if (-not $active) {
        Start-Sleep -Milliseconds 80
        continue
    }

    $pm = Invoke-RestMethod -Method Get -Uri "$base/api/player/$active"
    $self = $pm.players | Where-Object { $_.id -eq $active }
    $wf = $self.waitingFor

    if ($wf) {
        switch ($wf.type) {
            'select_hex' {
                if ($wf.validHexKeys.Count -gt 0) {
                    $parts = ($wf.validHexKeys[0] -split ',')
                    $body = @{ type = 'select_hex'; hex = @{ q = [int]$parts[0]; r = [int]$parts[1] } } | ConvertTo-Json -Depth 5
                    Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$active" -ContentType 'application/json' -Body $body | Out-Null
                }
            }
            'select_card' {
                if ($wf.validCardNames.Count -gt 0) {
                    $body = @{ type = 'select_card'; cardNames = @($wf.validCardNames[0]) } | ConvertTo-Json -Depth 5
                    Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$active" -ContentType 'application/json' -Body $body | Out-Null
                }
                else {
                    Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$active" -ContentType 'application/json' -Body (@{ type = 'confirm' } | ConvertTo-Json) | Out-Null
                }
            }
            'select_locker' {
                if ($wf.lockerIds.Count -gt 0) {
                    $body = @{ type = 'select_locker'; lockerId = $wf.lockerIds[0] } | ConvertTo-Json
                    Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$active" -ContentType 'application/json' -Body $body | Out-Null
                }
            }
            'or_options' {
                Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$active" -ContentType 'application/json' -Body (@{ type = 'or_options'; index = 0 } | ConvertTo-Json) | Out-Null
            }
            'confirm' {
                Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$active" -ContentType 'application/json' -Body (@{ type = 'confirm' } | ConvertTo-Json) | Out-Null
            }
            default {
                Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$active" -ContentType 'application/json' -Body (@{ type = 'confirm' } | ConvertTo-Json) | Out-Null
            }
        }
    }
    else {
        if ($spec.phase -eq 'PLACEMENT' -or $spec.phase -eq 'ESCAPE') {
            $hexes = @($spec.board.highlightedHexKeys)
            if ($hexes.Count -gt 0) {
                $parts = ($hexes[0] -split ',')
                $body = @{ type = 'select_hex'; hex = @{ q = [int]$parts[0]; r = [int]$parts[1] } } | ConvertTo-Json -Depth 5
                Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$active" -ContentType 'application/json' -Body $body | Out-Null
            }
        }
        else {
            Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$active" -ContentType 'application/json' -Body (@{ type = 'confirm' } | ConvertTo-Json) | Out-Null
        }
    }

    if ($stall -gt 120) {
        Invoke-RestMethod -Method Post -Uri "$base/api/player-input/$active" -ContentType 'application/json' -Body (@{ type = 'confirm' } | ConvertTo-Json) | Out-Null
        $stall = 0
    }

    Start-Sleep -Milliseconds 80
}

$final = Invoke-RestMethod -Method Get -Uri "$base/api/spectator/$gameId"
$tracking = Invoke-RestMethod -Method Get -Uri "$base/api/game/$gameId/tracking"

$outDir = 'data'
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

$logFile = Join-Path $outDir ("gamelog-$gameId.txt")
$trackingFile = Join-Path $outDir ("tracking-$gameId.json")

$tracking.gameLog | Set-Content -Path $logFile -Encoding UTF8
($tracking | ConvertTo-Json -Depth 12) | Set-Content -Path $trackingFile -Encoding UTF8

Write-Output ("GAME_ID=$gameId")
Write-Output ("PHASE=$($final.phase)")
Write-Output ("LOG_FILE=$logFile")
Write-Output ("TRACKING_FILE=$trackingFile")
Write-Output ("LOG_LINES=$($tracking.gameLog.Count)")
param(
    [int]$Count = 100,
    [ValidateRange(2, 5)]
    [int]$PlayerCount = 5,
    [ValidateRange(10, 600)]
    [int]$GameTimeoutSec = 90,
    [string]$OutputCsv = '.\\data\\batch-metrics.csv'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

function Get-OutputValue {
    param(
        [string[]]$Lines,
        [string]$Key
    )

    $prefix = "$Key="
    foreach ($line in $Lines) {
        if ($line.StartsWith($prefix)) {
            return $line.Substring($prefix.Length).Trim()
        }
    }
    return $null
}

function Get-LogCount {
    param(
        [object[]]$Lines,
        [string]$Pattern
    )

    if (-not $Lines) { return 0 }
    return @($Lines | Where-Object { $_ -match $Pattern }).Count
}

function Get-NightsLasted {
    param([object[]]$Lines)

    $maxNight = 0
    foreach ($line in @($Lines)) {
        if ($line -match 'Night\s+(\d+)\s+begins') {
            $night = [int]$matches[1]
            if ($night -gt $maxNight) { $maxNight = $night }
        }
    }

    if ($maxNight -gt 0) { return $maxNight }
    if (@($Lines).Count -gt 0) { return 1 }
    return 0
}

function Get-CardSummary {
    param([object[]]$Entries)

    if (-not $Entries) { return '' }
    $parts = @()
    foreach ($entry in @($Entries)) {
        if (-not $entry) { continue }
        $name = [string]$entry.cardName
        $count = [int]$entry.count
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        $parts += ("{0} x{1}" -f $name, $count)
    }
    return ($parts -join '; ')
}

function Invoke-LocalSimulation {
    param(
        [int]$PlayerCount,
        [int]$TimeoutSec,
        [string]$WorkingDir,
        [string]$HeartbeatFile
    )

    $job = Start-Job -ScriptBlock {
        param($pc, $wd, $hb)
        Set-Location $wd
        $output = @(& npx.cmd tsx .\scripts\run-bot-game-local.ts "--players=$pc" "--heartbeat-file=$hb" 2>&1)
        $output
        "__EXITCODE=$LASTEXITCODE"
    } -ArgumentList $PlayerCount, $WorkingDir, $HeartbeatFile

    try {
        $finished = Wait-Job -Job $job -Timeout $TimeoutSec
        if (-not $finished) {
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            return @{
                ExitCode = 124
                Lines    = @('RUNNER_TIMEOUT=true')
            }
        }

        $raw = @(Receive-Job -Job $job)
        $exitMarker = @($raw | Where-Object { $_ -is [string] -and $_.StartsWith('__EXITCODE=') } | Select-Object -Last 1)

        $exitCode = 1
        if ($exitMarker) {
            $exitCode = [int]$exitMarker.Substring('__EXITCODE='.Length)
        }

        $allLines = @($raw | Where-Object { -not ($_ -is [string] -and $_.StartsWith('__EXITCODE=')) } | ForEach-Object { "$_" })

        return @{
            ExitCode = $exitCode
            Lines    = $allLines
        }
    }
    finally {
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $repoRoot

try {
    $outDir = Split-Path -Path $OutputCsv -Parent
    if ($outDir -and -not (Test-Path $outDir)) {
        New-Item -Path $outDir -ItemType Directory -Force | Out-Null
    }

    $rows = New-Object 'System.Collections.Generic.List[object]'

    for ($run = 1; $run -le $Count; $run++) {
        $startedAt = Get-Date
        Write-Host ("[{0}/{1}] Running simulation ({2} players)..." -f $run, $Count, $PlayerCount)

        $heartbeatFile = Join-Path $repoRoot ("data\timeout-heartbeat-{0}p-run{1}.json" -f $PlayerCount, $run)
        $sim = Invoke-LocalSimulation -PlayerCount $PlayerCount -TimeoutSec $GameTimeoutSec -WorkingDir $repoRoot -HeartbeatFile $heartbeatFile
        $rawLines = @($sim.Lines)
        $exitCode = [int]$sim.ExitCode

        $gameId = Get-OutputValue -Lines $rawLines -Key 'GAME_ID'
        $phase = Get-OutputValue -Lines $rawLines -Key 'PHASE'
        $winner = Get-OutputValue -Lines $rawLines -Key 'WINNER'
        $logFile = Get-OutputValue -Lines $rawLines -Key 'LOG_FILE'
        $trackingFile = Get-OutputValue -Lines $rawLines -Key 'TRACKING_FILE'
        $logLinesFromStdout = Get-OutputValue -Lines $rawLines -Key 'LOG_LINES'

        $trapPlacements = 0
        $baitPlacements = 0
        $barricadePlacements = 0
        $cardPlays = 0
        $rowColLoopMsg = 0
        $adjacentLoopMsg = 0
        $targetPromptCount = 0
        $pendingTargetCanceled = 0
        $nightsLasted = 0
        $cpu1Score = $null
        $cpu2Score = $null
        $cpu3Score = $null
        $cpu4Score = $null
        $cpu5Score = $null
        $cpu1Rank = $null
        $cpu2Rank = $null
        $cpu3Rank = $null
        $cpu4Rank = $null
        $cpu5Rank = $null
        $cpu1Hero = $null
        $cpu2Hero = $null
        $cpu3Hero = $null
        $cpu4Hero = $null
        $cpu5Hero = $null
        $cpu1LockerCards = $null
        $cpu2LockerCards = $null
        $cpu3LockerCards = $null
        $cpu4LockerCards = $null
        $cpu5LockerCards = $null
        $cpu1SP = $null
        $cpu2SP = $null
        $cpu3SP = $null
        $cpu4SP = $null
        $cpu5SP = $null
        $cpu1NP = $null
        $cpu2NP = $null
        $cpu3NP = $null
        $cpu4NP = $null
        $cpu5NP = $null
        $cpu1CP = $null
        $cpu2CP = $null
        $cpu3CP = $null
        $cpu4CP = $null
        $cpu5CP = $null
        $cpu1StepsTaken = 0
        $cpu2StepsTaken = 0
        $cpu3StepsTaken = 0
        $cpu4StepsTaken = 0
        $cpu5StepsTaken = 0
        $cpu1TrapsBuilt = 0
        $cpu2TrapsBuilt = 0
        $cpu3TrapsBuilt = 0
        $cpu4TrapsBuilt = 0
        $cpu5TrapsBuilt = 0
        $cpu1BarricadesBuilt = 0
        $cpu2BarricadesBuilt = 0
        $cpu3BarricadesBuilt = 0
        $cpu4BarricadesBuilt = 0
        $cpu5BarricadesBuilt = 0
        $cpu1CardsBought = 0
        $cpu2CardsBought = 0
        $cpu3CardsBought = 0
        $cpu4CardsBought = 0
        $cpu5CardsBought = 0
        $cpu1CardsBoughtList = $null
        $cpu2CardsBoughtList = $null
        $cpu3CardsBoughtList = $null
        $cpu4CardsBoughtList = $null
        $cpu5CardsBoughtList = $null
        $cpu1CardsPlayed = 0
        $cpu2CardsPlayed = 0
        $cpu3CardsPlayed = 0
        $cpu4CardsPlayed = 0
        $cpu5CardsPlayed = 0
        $cpu1CardsActivated = 0
        $cpu2CardsActivated = 0
        $cpu3CardsActivated = 0
        $cpu4CardsActivated = 0
        $cpu5CardsActivated = 0
        $cpu1CardsPlayedList = $null
        $cpu2CardsPlayedList = $null
        $cpu3CardsPlayedList = $null
        $cpu4CardsPlayedList = $null
        $cpu5CardsPlayedList = $null
        $timeoutStep = $null
        $timeoutPhase = $null
        $timeoutGeneration = $null
        $timeoutPlayer = $null
        $timeoutWaitingFor = $null
        $timeoutPendingInteraction = $null
        $timeoutPendingTargetCard = $null
        $timeoutLastDecisionAction = $null
        $timeoutLastDecisionCard = $null
        $timeoutLastDecisionReason = $null

        $status = 'ok'
        $errorText = ''

        if ($exitCode -ne 0) {
            if ($exitCode -eq 124) {
                $status = 'runner_timeout'
                $errorText = "run-bot-game-local.ts exceeded timeout (${GameTimeoutSec}s)"
                if (Test-Path $heartbeatFile) {
                    try {
                        $hb = Get-Content $heartbeatFile -Raw | ConvertFrom-Json
                        $timeoutStep = $hb.step
                        $timeoutPhase = $hb.phase
                        $timeoutGeneration = $hb.generation
                        $timeoutPlayer = $hb.currentPlayerName
                        $timeoutWaitingFor = $hb.waitingForType
                        $timeoutPendingInteraction = $hb.pendingInteractionType
                        $timeoutPendingTargetCard = $hb.pendingTargetCardName
                        $timeoutLastDecisionAction = $hb.lastDecisionActionType
                        $timeoutLastDecisionCard = $hb.lastDecisionCard
                        $timeoutLastDecisionReason = $hb.lastDecisionReason
                    }
                    catch {
                        # Ignore heartbeat parse failures; timeout status is still valid.
                    }
                }
            }
            else {
                $status = 'runner_error'
                $errorText = "run-bot-game-local.ts exited with code $exitCode"
            }
        }
        elseif (-not $trackingFile -or -not (Test-Path $trackingFile)) {
            $status = 'tracking_missing'
            $errorText = 'TRACKING_FILE not found in runner output or file does not exist'
        }
        else {
            try {
                $tracking = Get-Content $trackingFile -Raw | ConvertFrom-Json
                $gameLog = @($tracking.gameLog)

                $trapPlacements = Get-LogCount -Lines $gameLog -Pattern 'placed a trap'
                $baitPlacements = Get-LogCount -Lines $gameLog -Pattern 'placed bait'
                $barricadePlacements = Get-LogCount -Lines $gameLog -Pattern 'placed a barricade|placed a free barricade'
                $rowColLoopMsg = Get-LogCount -Lines $gameLog -Pattern 'Must select a tile in the same row or column'
                $adjacentLoopMsg = Get-LogCount -Lines $gameLog -Pattern 'Select a tile adjacent to the zombie'
                $targetPromptCount = Get-LogCount -Lines $gameLog -Pattern 'Select which zombie to remove with'
                $pendingTargetCanceled = Get-LogCount -Lines $gameLog -Pattern 'canceled pending target'
                $nightsLasted = Get-NightsLasted -Lines $gameLog
                $cardPlays = @($tracking.cardsPlayedByPlayer).Count

                $scoreByName = @{}
                $rankByName = @{}
                foreach ($score in @($tracking.finalScoresByPlayer)) {
                    if (-not $score -or -not $score.playerName) { continue }
                    $scoreByName[$score.playerName] = $score.finalScore
                    $rankByName[$score.playerName] = $score.rank
                }

                $heroByName = @{}
                $lockersByName = @{}
                foreach ($selection in @($tracking.playerSelectionsByPlayer)) {
                    if (-not $selection -or -not $selection.playerName) { continue }
                    $heroByName[$selection.playerName] = $selection.heroName
                    $lockersByName[$selection.playerName] = (@($selection.lockerNames) -join '; ')
                }

                $cpu1Score = $scoreByName['CPU-1']
                $cpu2Score = $scoreByName['CPU-2']
                $cpu3Score = $scoreByName['CPU-3']
                $cpu4Score = $scoreByName['CPU-4']
                $cpu5Score = $scoreByName['CPU-5']
                $cpu1Rank = $rankByName['CPU-1']
                $cpu2Rank = $rankByName['CPU-2']
                $cpu3Rank = $rankByName['CPU-3']
                $cpu4Rank = $rankByName['CPU-4']
                $cpu5Rank = $rankByName['CPU-5']
                $cpu1Hero = $heroByName['CPU-1']
                $cpu2Hero = $heroByName['CPU-2']
                $cpu3Hero = $heroByName['CPU-3']
                $cpu4Hero = $heroByName['CPU-4']
                $cpu5Hero = $heroByName['CPU-5']
                $cpu1LockerCards = $lockersByName['CPU-1']
                $cpu2LockerCards = $lockersByName['CPU-2']
                $cpu3LockerCards = $lockersByName['CPU-3']
                $cpu4LockerCards = $lockersByName['CPU-4']
                $cpu5LockerCards = $lockersByName['CPU-5']

                $metricsByName = @{}
                foreach ($metric in @($tracking.playerMetricsByPlayer)) {
                    if (-not $metric -or -not $metric.playerName) { continue }
                    $metricsByName[$metric.playerName] = $metric
                }

                $m1 = $metricsByName['CPU-1']
                $m2 = $metricsByName['CPU-2']
                $m3 = $metricsByName['CPU-3']
                $m4 = $metricsByName['CPU-4']
                $m5 = $metricsByName['CPU-5']

                if ($m1) {
                    $cpu1SP = $m1.finalSP; $cpu1NP = $m1.finalNP; $cpu1CP = $m1.finalCP
                    $cpu1StepsTaken = $m1.stepsTaken; $cpu1TrapsBuilt = $m1.trapsBuilt; $cpu1BarricadesBuilt = $m1.barricadesBuilt
                    $cpu1CardsBought = $m1.cardsBought; $cpu1CardsBoughtList = Get-CardSummary -Entries @($m1.cardsBoughtByName)
                    $cpu1CardsPlayed = $m1.cardsPlayed; $cpu1CardsActivated = $m1.cardsActivated; $cpu1CardsPlayedList = Get-CardSummary -Entries @($m1.cardsPlayedByName)
                }
                if ($m2) {
                    $cpu2SP = $m2.finalSP; $cpu2NP = $m2.finalNP; $cpu2CP = $m2.finalCP
                    $cpu2StepsTaken = $m2.stepsTaken; $cpu2TrapsBuilt = $m2.trapsBuilt; $cpu2BarricadesBuilt = $m2.barricadesBuilt
                    $cpu2CardsBought = $m2.cardsBought; $cpu2CardsBoughtList = Get-CardSummary -Entries @($m2.cardsBoughtByName)
                    $cpu2CardsPlayed = $m2.cardsPlayed; $cpu2CardsActivated = $m2.cardsActivated; $cpu2CardsPlayedList = Get-CardSummary -Entries @($m2.cardsPlayedByName)
                }
                if ($m3) {
                    $cpu3SP = $m3.finalSP; $cpu3NP = $m3.finalNP; $cpu3CP = $m3.finalCP
                    $cpu3StepsTaken = $m3.stepsTaken; $cpu3TrapsBuilt = $m3.trapsBuilt; $cpu3BarricadesBuilt = $m3.barricadesBuilt
                    $cpu3CardsBought = $m3.cardsBought; $cpu3CardsBoughtList = Get-CardSummary -Entries @($m3.cardsBoughtByName)
                    $cpu3CardsPlayed = $m3.cardsPlayed; $cpu3CardsActivated = $m3.cardsActivated; $cpu3CardsPlayedList = Get-CardSummary -Entries @($m3.cardsPlayedByName)
                }
                if ($m4) {
                    $cpu4SP = $m4.finalSP; $cpu4NP = $m4.finalNP; $cpu4CP = $m4.finalCP
                    $cpu4StepsTaken = $m4.stepsTaken; $cpu4TrapsBuilt = $m4.trapsBuilt; $cpu4BarricadesBuilt = $m4.barricadesBuilt
                    $cpu4CardsBought = $m4.cardsBought; $cpu4CardsBoughtList = Get-CardSummary -Entries @($m4.cardsBoughtByName)
                    $cpu4CardsPlayed = $m4.cardsPlayed; $cpu4CardsActivated = $m4.cardsActivated; $cpu4CardsPlayedList = Get-CardSummary -Entries @($m4.cardsPlayedByName)
                }
                if ($m5) {
                    $cpu5SP = $m5.finalSP; $cpu5NP = $m5.finalNP; $cpu5CP = $m5.finalCP
                    $cpu5StepsTaken = $m5.stepsTaken; $cpu5TrapsBuilt = $m5.trapsBuilt; $cpu5BarricadesBuilt = $m5.barricadesBuilt
                    $cpu5CardsBought = $m5.cardsBought; $cpu5CardsBoughtList = Get-CardSummary -Entries @($m5.cardsBoughtByName)
                    $cpu5CardsPlayed = $m5.cardsPlayed; $cpu5CardsActivated = $m5.cardsActivated; $cpu5CardsPlayedList = Get-CardSummary -Entries @($m5.cardsPlayedByName)
                }

                if (-not $winner -and @($tracking.finalScoresByPlayer).Count -gt 0) {
                    $winner = (@($tracking.finalScoresByPlayer) | Sort-Object rank | Select-Object -First 1).playerName
                }

                if ($phase -ne 'game_over' -and $status -eq 'ok') {
                    $status = 'incomplete'
                    if (-not $errorText) {
                        $errorText = 'Simulation ended before GAME_OVER (max step limit reached).'
                    }
                }
            }
            catch {
                $status = 'parse_error'
                $errorText = $_.Exception.Message
            }
        }

        $durationMs = [int][Math]::Round(((Get-Date) - $startedAt).TotalMilliseconds)

        if ($status -ne 'runner_timeout' -and (Test-Path $heartbeatFile)) {
            Remove-Item -Path $heartbeatFile -Force -ErrorAction SilentlyContinue
        }

        $rows.Add([PSCustomObject]@{
                runIndex                  = $run
                gameId                    = $gameId
                phase                     = $phase
                winner                    = $winner
                status                    = $status
                durationMs                = $durationMs
                playerCount               = $PlayerCount
                logFile                   = $logFile
                trackingFile              = $trackingFile
                logLines                  = $logLinesFromStdout
                nightsLasted              = $nightsLasted
                trapPlacements            = $trapPlacements
                baitPlacements            = $baitPlacements
                barricadePlacements       = $barricadePlacements
                cardPlays                 = $cardPlays
                rowColLoopMsg             = $rowColLoopMsg
                adjacentLoopMsg           = $adjacentLoopMsg
                targetPromptCount         = $targetPromptCount
                pendingTargetCanceled     = $pendingTargetCanceled
                cpu1Score                 = $cpu1Score
                cpu2Score                 = $cpu2Score
                cpu3Score                 = $cpu3Score
                cpu4Score                 = $cpu4Score
                cpu5Score                 = $cpu5Score
                cpu1Rank                  = $cpu1Rank
                cpu2Rank                  = $cpu2Rank
                cpu3Rank                  = $cpu3Rank
                cpu4Rank                  = $cpu4Rank
                cpu5Rank                  = $cpu5Rank
                cpu1SP                    = $cpu1SP
                cpu2SP                    = $cpu2SP
                cpu3SP                    = $cpu3SP
                cpu4SP                    = $cpu4SP
                cpu5SP                    = $cpu5SP
                cpu1NP                    = $cpu1NP
                cpu2NP                    = $cpu2NP
                cpu3NP                    = $cpu3NP
                cpu4NP                    = $cpu4NP
                cpu5NP                    = $cpu5NP
                cpu1CP                    = $cpu1CP
                cpu2CP                    = $cpu2CP
                cpu3CP                    = $cpu3CP
                cpu4CP                    = $cpu4CP
                cpu5CP                    = $cpu5CP
                cpu1Hero                  = $cpu1Hero
                cpu2Hero                  = $cpu2Hero
                cpu3Hero                  = $cpu3Hero
                cpu4Hero                  = $cpu4Hero
                cpu5Hero                  = $cpu5Hero
                cpu1LockerCards           = $cpu1LockerCards
                cpu2LockerCards           = $cpu2LockerCards
                cpu3LockerCards           = $cpu3LockerCards
                cpu4LockerCards           = $cpu4LockerCards
                cpu5LockerCards           = $cpu5LockerCards
                cpu1StepsTaken            = $cpu1StepsTaken
                cpu2StepsTaken            = $cpu2StepsTaken
                cpu3StepsTaken            = $cpu3StepsTaken
                cpu4StepsTaken            = $cpu4StepsTaken
                cpu5StepsTaken            = $cpu5StepsTaken
                cpu1TrapsBuilt            = $cpu1TrapsBuilt
                cpu2TrapsBuilt            = $cpu2TrapsBuilt
                cpu3TrapsBuilt            = $cpu3TrapsBuilt
                cpu4TrapsBuilt            = $cpu4TrapsBuilt
                cpu5TrapsBuilt            = $cpu5TrapsBuilt
                cpu1BarricadesBuilt       = $cpu1BarricadesBuilt
                cpu2BarricadesBuilt       = $cpu2BarricadesBuilt
                cpu3BarricadesBuilt       = $cpu3BarricadesBuilt
                cpu4BarricadesBuilt       = $cpu4BarricadesBuilt
                cpu5BarricadesBuilt       = $cpu5BarricadesBuilt
                cpu1CardsBought           = $cpu1CardsBought
                cpu2CardsBought           = $cpu2CardsBought
                cpu3CardsBought           = $cpu3CardsBought
                cpu4CardsBought           = $cpu4CardsBought
                cpu5CardsBought           = $cpu5CardsBought
                cpu1CardsBoughtList       = $cpu1CardsBoughtList
                cpu2CardsBoughtList       = $cpu2CardsBoughtList
                cpu3CardsBoughtList       = $cpu3CardsBoughtList
                cpu4CardsBoughtList       = $cpu4CardsBoughtList
                cpu5CardsBoughtList       = $cpu5CardsBoughtList
                cpu1CardsPlayed           = $cpu1CardsPlayed
                cpu2CardsPlayed           = $cpu2CardsPlayed
                cpu3CardsPlayed           = $cpu3CardsPlayed
                cpu4CardsPlayed           = $cpu4CardsPlayed
                cpu5CardsPlayed           = $cpu5CardsPlayed
                cpu1CardsActivated        = $cpu1CardsActivated
                cpu2CardsActivated        = $cpu2CardsActivated
                cpu3CardsActivated        = $cpu3CardsActivated
                cpu4CardsActivated        = $cpu4CardsActivated
                cpu5CardsActivated        = $cpu5CardsActivated
                cpu1CardsPlayedList       = $cpu1CardsPlayedList
                cpu2CardsPlayedList       = $cpu2CardsPlayedList
                cpu3CardsPlayedList       = $cpu3CardsPlayedList
                cpu4CardsPlayedList       = $cpu4CardsPlayedList
                cpu5CardsPlayedList       = $cpu5CardsPlayedList
                timeoutStep               = $timeoutStep
                timeoutPhase              = $timeoutPhase
                timeoutGeneration         = $timeoutGeneration
                timeoutPlayer             = $timeoutPlayer
                timeoutWaitingFor         = $timeoutWaitingFor
                timeoutPendingInteraction = $timeoutPendingInteraction
                timeoutPendingTargetCard  = $timeoutPendingTargetCard
                timeoutLastDecisionAction = $timeoutLastDecisionAction
                timeoutLastDecisionCard   = $timeoutLastDecisionCard
                timeoutLastDecisionReason = $timeoutLastDecisionReason
                error                     = $errorText
            })

        Write-Host ("[{0}/{1}] Completed: gameId={2}, phase={3}, winner={4}, nights={5}, status={6}" -f $run, $Count, $gameId, $phase, $winner, $nightsLasted, $status)
    }

    $rows | Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding UTF8

    $okCount = @($rows | Where-Object { $_.status -eq 'ok' }).Count
    Write-Output "BATCH_COMPLETE=true"
    Write-Output "RUN_COUNT=$Count"
    Write-Output "PLAYER_COUNT=$PlayerCount"
    Write-Output "SUCCESS_COUNT=$okCount"
    Write-Output "OUTPUT_CSV=$((Resolve-Path $OutputCsv).Path)"
}
finally {
    Pop-Location
}

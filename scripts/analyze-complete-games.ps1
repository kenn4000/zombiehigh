param(
  [string[]]$Files = @(".\data\batch-metrics-2p.csv", ".\data\batch-metrics-3p.csv", ".\data\batch-metrics-4p.csv", ".\data\batch-metrics-5p.csv"),
  [string]$LockerOutputCsv = '.\data\locker_card_win_variance.csv',
  [string]$HeroOutputCsv = '.\data\hero_win_variance.csv',
  [string]$DeckOutputCsv = '.\data\deck_card_win_variance.csv'
)

$files = $Files
$rows = @()
foreach ($f in $files) { $rows += Import-Csv $f }

# Only completed games should contribute to win-rate variance metrics.
$rows = @($rows | Where-Object { $_.status -eq 'ok' -and $_.phase -eq 'game_over' })

function New-Stats {
  return @{
    overallGames = 0
    overallWins  = 0
    games2p      = 0
    wins2p       = 0
    games3p      = 0
    wins3p       = 0
    games4p      = 0
    wins4p       = 0
    games5p      = 0
    wins5p       = 0
  }
}

function Add-Occurrence {
  param(
    [hashtable]$Map,
    [string]$Name,
    [int]$PlayerCount,
    [bool]$Won
  )

  if ([string]::IsNullOrWhiteSpace($Name)) { return }

  if (-not $Map.ContainsKey($Name)) {
    $Map[$Name] = New-Stats
  }

  $s = $Map[$Name]
  $s.overallGames++
  if ($Won) { $s.overallWins++ }

  switch ($PlayerCount) {
    2 {
      $s.games2p++
      if ($Won) { $s.wins2p++ }
    }
    3 {
      $s.games3p++
      if ($Won) { $s.wins3p++ }
    }
    4 {
      $s.games4p++
      if ($Won) { $s.wins4p++ }
    }
    5 {
      $s.games5p++
      if ($Won) { $s.wins5p++ }
    }
  }
}

function WinPct {
  param([int]$Wins, [int]$Games)
  if ($Games -le 0) { return 0 }
  return [math]::Round((100.0 * $Wins / $Games), 2)
}

function Parse-CardCountList {
  param([string]$Raw)
  $out = @()
  if ([string]::IsNullOrWhiteSpace($Raw)) { return $out }
  foreach ($piece in ($Raw -split ';')) {
    $name = $piece.Trim()
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    $xIdx = $name.LastIndexOf(' x')
    if ($xIdx -gt 0) {
      $name = $name.Substring(0, $xIdx).Trim()
    }
    if (-not [string]::IsNullOrWhiteSpace($name)) {
      $out += $name
    }
  }
  return $out
}

function Build-SummaryRows {
  param(
    [hashtable]$Map,
    [string]$NameField
  )

  return @($Map.GetEnumerator() | ForEach-Object {
      $name = $_.Key
      $s = $_.Value
      [PSCustomObject]@{
        $NameField    = $name
        overallGames  = [int]$s.overallGames
        overallWinPct = (WinPct -Wins $s.overallWins -Games $s.overallGames)
        games2p       = [int]$s.games2p
        winPct2p      = (WinPct -Wins $s.wins2p -Games $s.games2p)
        games3p       = [int]$s.games3p
        winPct3p      = (WinPct -Wins $s.wins3p -Games $s.games3p)
        games4p       = [int]$s.games4p
        winPct4p      = (WinPct -Wins $s.wins4p -Games $s.games4p)
        games5p       = [int]$s.games5p
        winPct5p      = (WinPct -Wins $s.wins5p -Games $s.games5p)
      }
    } | Sort-Object -Property @{Expression = 'overallGames'; Descending = $true }, @{Expression = $NameField; Descending = $false })
}

$heroStats = @{}
$lockerStats = @{}
$deckStats = @{}
$deckCardNamesSeen = New-Object 'System.Collections.Generic.HashSet[string]'

foreach ($r in $rows) {
  $n = [int]$r.playerCount
  $winner = $r.winner

  for ($i = 1; $i -le $n; $i++) {
    $playerName = "CPU-$i"
    $won = ($playerName -eq $winner)

    $heroField = "cpu${i}Hero"
    $heroName = $r.$heroField
    Add-Occurrence -Map $heroStats -Name $heroName -PlayerCount $n -Won $won

    $lockerField = "cpu${i}LockerCards"
    foreach ($lockerName in Parse-CardCountList -Raw $r.$lockerField) {
      Add-Occurrence -Map $lockerStats -Name $lockerName -PlayerCount $n -Won $won
    }

    $deckField = "cpu${i}CardsPlayedList"
    foreach ($deckCardName in Parse-CardCountList -Raw $r.$deckField) {
      [void]$deckCardNamesSeen.Add($deckCardName)
      Add-Occurrence -Map $deckStats -Name $deckCardName -PlayerCount $n -Won $won
    }

    $deckBoughtField = "cpu${i}CardsBoughtList"
    foreach ($deckBoughtName in Parse-CardCountList -Raw $r.$deckBoughtField) {
      [void]$deckCardNamesSeen.Add($deckBoughtName)
    }
  }
}

# Ensure deck variance includes cards that were bought but never played.
foreach ($deckName in $deckCardNamesSeen) {
  if (-not $deckStats.ContainsKey($deckName)) {
    $deckStats[$deckName] = New-Stats
  }
}

$heroSummary = Build-SummaryRows -Map $heroStats -NameField 'heroName'
$lockerSummary = Build-SummaryRows -Map $lockerStats -NameField 'cardName'
$deckSummary = Build-SummaryRows -Map $deckStats -NameField 'cardName'

$lockerPath = $LockerOutputCsv
$heroPath = $HeroOutputCsv
$deckPath = $DeckOutputCsv
$lockerSummary | Export-Csv $lockerPath -NoTypeInformation
$heroSummary | Export-Csv $heroPath -NoTypeInformation
$deckSummary | Export-Csv $deckPath -NoTypeInformation

"complete_rows_total=" + $rows.Count
"hero_entities=" + $heroSummary.Count
"locker_entities=" + $lockerSummary.Count
"deck_entities=" + $deckSummary.Count
"locker_output=$lockerPath"
"hero_output=$heroPath"
"deck_output=$deckPath"
"top_heroes:"
$heroSummary | Select-Object -First 10 | Format-Table heroName, overallGames, overallWinPct, games2p, winPct2p, games3p, winPct3p, games4p, winPct4p, games5p, winPct5p -AutoSize | Out-String -Width 260

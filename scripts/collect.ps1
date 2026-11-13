# Steam Wrapped 2026 — built-in Windows PowerShell collector
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Year=2026;$Api='https://api.steampowered.com'
$Months=@('January','February','March','April','May','June','July','August','September','October','November','December')
$Days=@('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
function ApiGet([string]$Path,[hashtable]$Params){
  $q=foreach($k in $Params.Keys){[uri]::EscapeDataString([string]$k)+'='+[uri]::EscapeDataString([string]$Params[$k])}
  $uri="$Api/$Path?"+($q -join '&')
  for($i=0;$i -lt 3;$i++){try{return Invoke-RestMethod -Uri $uri -TimeoutSec 45 -Headers @{'User-Agent'='SteamWrapped2026/1.0'}}catch{$status=0;try{$status=[int]$_.Exception.Response.StatusCode}catch{};if($i -lt 2 -and ($status -eq 0 -or $status -eq 429 -or $status -ge 500)){Start-Sleep -Seconds ([math]::Pow(2,$i));continue};throw "Steam API error ($status): $($_.Exception.Message)"}}
}
function SteamRoot{
  try{$p=(Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction Stop).SteamPath;if($p -and (Test-Path $p)){return $p}}catch{}
  foreach($p in @("$env:ProgramFiles(x86)\Steam","$env:ProgramFiles\Steam",'C:\Steam')){if($p -and (Test-Path $p)){return $p}}
  return $null
}
function DetectedSteamId([string]$Root){
  if(-not $Root){return $null};$f=Join-Path $Root 'config\loginusers.vdf';if(-not(Test-Path $f)){return $null}
  $s=Get-Content -LiteralPath $f -Raw
  foreach($block in [regex]::Matches($s,'(?s)"(?<id>\d{17})"\s*\{(?<body>.*?)\}')){
    if([regex]::IsMatch($block.Groups['body'].Value,'"MostRecent"\s*"1"')){return $block.Groups['id'].Value}
  }
  $m=[regex]::Match($s,'"(?<id>\d{17})"\s*\{');if($m.Success){return $m.Groups['id'].Value};return $null
}
function ResolveId([string]$Value,[string]$Key){
  $m=[regex]::Match($Value,'\d{17}');if($m.Success){return $m.Value}
  $vanity=($Value.Trim().TrimEnd('/') -split '/')[-1];$r=ApiGet 'ISteamUser/ResolveVanityURL/v1/' @{key=$Key;vanityurl=$vanity}
  if($r.response.success -ne 1 -or -not $r.response.steamid){throw "Cannot resolve Steam profile '$Value'."};return [string]$r.response.steamid
}
function IsoLocal([datetime]$d){return ([DateTimeOffset]::new($d,[TimeZoneInfo]::Local.GetUtcOffset($d))).ToString("yyyy-MM-dd'T'HH:mm:sszzz")}
function LocalSessions([string]$Root){
  $folders=@();if($Root){$folders+=(Join-Path $Root 'logs')}
  $folders+=@("$env:ProgramFiles(x86)\Steam\logs","$env:ProgramFiles\Steam\logs",'C:\Steam\logs',"$env:LOCALAPPDATA\Steam\logs")
  $folders=@($folders|Where-Object{$_ -and(Test-Path $_ -PathType Container)}|Select-Object -Unique);$files=@()
  foreach($d in $folders){$files+=@(Get-ChildItem -LiteralPath $d -File -ErrorAction SilentlyContinue|Where-Object{$_.Name -match '^(controller_ui|compat_log|gameprocess_log).*\.(txt|log)$'})}
  $files=@($files|Sort-Object FullName -Unique)
  $by=@{controller_ui=(New-Object 'System.Collections.Generic.List[object]');compat_log=(New-Object 'System.Collections.Generic.List[object]');gameprocess_log=(New-Object 'System.Collections.Generic.List[object]')}
  foreach($f in $files){
    if($f.Name -match '^controller_ui'){$src='controller_ui'}elseif($f.Name -match '^compat_log'){$src='compat_log'}else{$src='gameprocess_log'}
    foreach($line in Get-Content -LiteralPath $f.FullName -ErrorAction SilentlyContinue){
      $tm=[regex]::Match($line,'^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]');if(-not $tm.Success){continue}
      try{$stamp=[datetime]::Parse($tm.Groups[1].Value,[Globalization.CultureInfo]::InvariantCulture)}catch{continue}
      $ev=$null;$act=$null
      switch($src){
        'controller_ui'{$ev=[regex]::Match($line,'\bStarting app\s+(\d+)\b','IgnoreCase');if($ev.Success){$act='start'}else{$ev=[regex]::Match($line,'\bExiting app\s+(\d+)\b','IgnoreCase');if($ev.Success){$act='end'}}}
        'compat_log'{$ev=[regex]::Match($line,'\bStartSession:\s*appID\s+(\d+)\b','IgnoreCase');if($ev.Success){$act='start'}else{$ev=[regex]::Match($line,'\brelease session\(s\) for appID\s+(\d+)\b','IgnoreCase');if($ev.Success){$act='end'}}}
        'gameprocess_log'{$ev=[regex]::Match($line,'\bGame\s+(\d+)\s+created process\b','IgnoreCase');if($ev.Success){$act='start'}else{$ev=[regex]::Match($line,'\bGame\s+(\d+)\s+exited\b','IgnoreCase');if($ev.Success){$act='end'}}}
      }
      if($act){$by[$src].Add([pscustomobject]@{Stamp=$stamp;Action=$act;AppId=[int]$ev.Groups[1].Value})}
    }
  }
  $sy=[datetime]::new($Year,1,1);$now=Get-Date;$ey=if($now.Year -eq $Year){$now.Date.AddDays(1)}else{[datetime]::new($Year+1,1,1)}
  $paired=New-Object 'System.Collections.Generic.List[object]';$covered=@{}
  foreach($src in @('controller_ui','compat_log','gameprocess_log')){
    $queues=@{};$sourcePaired=New-Object 'System.Collections.Generic.List[object]'
    foreach($e in @($by[$src]|Sort-Object Stamp)){
      $id=[int]$e.AppId;if(-not $queues.ContainsKey($id)){$queues[$id]=New-Object 'System.Collections.Generic.Queue[datetime]'}
      if($e.Action -eq 'start'){$queues[$id].Enqueue([datetime]$e.Stamp);continue}
      if($queues[$id].Count -eq 0){continue};$st=$queues[$id].Dequeue();$sec=($e.Stamp-$st).TotalSeconds
      if($sec -le 0 -or $sec -gt 86400 -or $e.Stamp -le $sy -or $st -ge $ey){continue}
      $sourcePaired.Add([pscustomobject]@{AppId=$id;Start=$st;End=[datetime]$e.Stamp;Seconds=[int][math]::Round($sec);Source=$src})
    }
    foreach($session in $sourcePaired){if(-not $covered.ContainsKey([int]$session.AppId)){$paired.Add($session)}}
    foreach($session in $sourcePaired){$covered[[int]$session.AppId]=$true}
  }
  return [pscustomobject]@{Sessions=@($paired.ToArray());Files=@($files|ForEach-Object{$_.Name})}
}
function MakeActivity([object[]]$Sessions){
  $now=Get-Date;$sy=[datetime]::new($Year,1,1);$ey=if($now.Year -eq $Year){$now.Date.AddDays(1)}else{[datetime]::new($Year+1,1,1)}
  $months=New-Object 'System.Collections.Generic.List[object]';for($i=0;$i -lt 12;$i++){$months.Add([pscustomobject]@{month=$i+1;name=$Months[$i];hours=0.0;sessions=0;achievements=0;activeDays=0})}
  $games=@{};$daily=@{};$weekday=@(0,0,0,0,0,0,0);$counted=New-Object 'System.Collections.Generic.List[object]'
  foreach($s in $Sessions){
    $st=if($s.Start -lt $sy){$sy}else{$s.Start};$en=if($s.End -gt $ey){$ey}else{$s.End};if($en -le $st){continue}
    $sec=[int][math]::Floor(($en-$st).TotalSeconds);if($sec -le 0){continue};$id=[int]$s.AppId
    if(-not $games.ContainsKey($id)){$games[$id]=@{hours=0.0;sessions=0;longest=0;days=@{}}}
    $games[$id].sessions++;$games[$id].longest=[math]::Max($games[$id].longest,$sec);$months[$st.Month-1].sessions++
    $counted.Add([pscustomobject]@{appId=$id;start=(IsoLocal $st);end=(IsoLocal $en);seconds=$sec;source=$s.Source})
    $cur=$st;while($cur -lt $en){$mid=$cur.Date.AddDays(1);$piece=if($en -lt $mid){$en}else{$mid};$part=[int][math]::Floor(($piece-$cur).TotalSeconds)
      if($part -gt 0){$dk=$cur.ToString('yyyy-MM-dd');if(-not $daily.ContainsKey($dk)){$daily[$dk]=0};$daily[$dk]+=$part;$wi=(([int]$cur.DayOfWeek+6)%7);$weekday[$wi]+=$part
        $games[$id].days[$dk]=$true;$games[$id].hours+=($part/3600.0);$months[$cur.Month-1].hours+=($part/3600.0)}
      $cur=$piece
    }
  }
  foreach($m in $months){$m.hours=[math]::Round($m.hours,2);$n=0;foreach($dk in $daily.Keys){if([int]$dk.Substring(5,2) -eq $m.month){$n++}};$m.activeDays=$n}
  $dailyList=@($daily.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{date=$_;minutes=[math]::Round($daily[$_]/60.0,1)}})
  $total=0;foreach($v in $daily.Values){$total+=[int]$v}
  $wh=@();for($i=0;$i -lt 7;$i++){$wh += [pscustomobject]@{day=$Days[$i];hours=[math]::Round($weekday[$i]/3600.0,2)}}
  $best=$wh|Sort-Object hours -Descending|Select-Object -First 1;$long=0;$first=$null;$last=$null
  if($counted.Count){$long=[int](($counted|Measure-Object seconds -Maximum).Maximum);$first=($counted|Sort-Object start|Select-Object -First 1).start.Substring(0,10);$last=($counted|Sort-Object end -Descending|Select-Object -First 1).end.Substring(0,10)}
  $totals=@{};foreach($id in $games.Keys){$totals[[string]$id]=[pscustomobject]@{hours=[math]::Round($games[$id].hours,2);sessions=$games[$id].sessions;longestSessionSeconds=$games[$id].longest;activeDays=$games[$id].days.Count}}
  $mc=if($now.Year -eq $Year){$now.Month}else{12}
  return [pscustomobject]@{monthly=@($months.ToArray()|Select-Object -First $mc);daily=$dailyList;totalHours=[math]::Round($total/3600.0,2);totalSessions=$counted.Count;activeDays=$daily.Count
    averageSessionMinutes=if($counted.Count){[math]::Round($total/$counted.Count/60.0,1)}else{$null};longestSessionSeconds=if($long){$long}else{$null};weekdayHours=$wh
    mostPlayedWeekday=if($best.hours -gt 0){$best.day}else{$null};firstSession=$first;lastSession=$last;gameTotals=$totals;sessions=@($counted.ToArray())}
}
function Achievements([object]$Game,[string]$Id,[string]$Key){
  try{$r=ApiGet 'ISteamUserStats/GetPlayerAchievements/v1/' @{key=$Key;steamid=$Id;appid=[int]$Game.appid;l='english'}}catch{return [pscustomobject]@{available=$false;unlocked=0;total=0;percent=0;events=@()}}
  $items=@($r.playerstats.achievements);if(-not $r.playerstats -or $null -eq $r.playerstats.achievements){$items=@()};$unlocked=@($items|Where-Object{[int]$_.achieved -eq 1});$evs=New-Object 'System.Collections.Generic.List[object]'
  foreach($a in $unlocked){try{$ut=[long]$a.unlocktime;if($ut -le 0){continue};$d=[DateTimeOffset]::FromUnixTimeSeconds($ut).LocalDateTime}catch{continue}
    if($d.Year -ne $Year){continue};$api=if($a.apiname){[string]$a.apiname}else{'Achievement'}
    $evs.Add([pscustomobject]@{appId=[int]$Game.appid;gameName=[string]$Game.name;apiName=$api;displayName=(Get-Culture).TextInfo.ToTitleCase($api.Replace('_',' '));unlockTime=$ut;date=$d.ToString("yyyy-MM-dd'T'HH:mm:sszzz")})
  }
  $n=$items.Count;return [pscustomobject]@{available=($n -gt 0);unlocked=$unlocked.Count;total=$n;percent=if($n){[int][math]::Round($unlocked.Count/$n*100)}else{0};events=@($evs.ToArray())}
}
function AchievementNames([int]$App,[string]$Key){$out=@{};try{$r=ApiGet 'ISteamUserStats/GetSchemaForGame/v2/' @{key=$Key;appid=$App;l='english'};foreach($a in @($r.game.availableGameStats.achievements)){if($a.name){$out[[string]$a.name]=[string]$a.displayName}}}catch{};return $out}
function PlayerStats([int]$App,[string]$Id,[string]$Key){
  try{$r=ApiGet 'ISteamUserStats/GetUserStatsForGame/v2/' @{key=$Key;steamid=$Id;appid=$App};$list=New-Object 'System.Collections.Generic.List[object]'
    foreach($s in @($r.playerstats.stats)){if($null -eq $s.name -or $null -eq $s.value -or $s.value -is [array]){continue};$n=[string]$s.name;$list.Add([pscustomobject]@{name=$n;displayName=(Get-Culture).TextInfo.ToTitleCase($n.Replace('_',' '));value=$s.value})}
    $items=@($list.ToArray()|Select-Object -First 120);return [pscustomobject]@{stats=$items;available=($items.Count -gt 0)}
  }catch{return [pscustomobject]@{stats=@();available=$false}}
}
try{
  Write-Host '';Write-Host 'STEAM WRAPPED 2026' -ForegroundColor Green;Write-Host 'Built-in Windows PowerShell. No Python or modules.' -ForegroundColor Gray
  $root=SteamRoot;$detected=DetectedSteamId $root
  if($detected){$inputId=Read-Host "Detected $detected. Press Enter to use it, or paste another profile";if([string]::IsNullOrWhiteSpace($inputId)){$inputId=$detected}}else{$inputId=Read-Host 'SteamID64 or public profile URL'}
  if([string]::IsNullOrWhiteSpace($inputId)){throw 'Steam account is required.'}
  $key=Read-Host 'Steam Web API key (https://steamcommunity.com/dev/apikey)';if([string]::IsNullOrWhiteSpace($key)){throw 'Steam API key is required.'}
  $id=ResolveId $inputId $key;Write-Host 'Loading Steam profile and library...'
  $pr=ApiGet 'ISteamUser/GetPlayerSummaries/v2/' @{key=$key;steamids=$id};$players=@($pr.response.players);if(-not $players.Count){throw 'Steam profile not found.'};$player=$players[0]
  $owned=ApiGet 'IPlayerService/GetOwnedGames/v1/' @{key=$key;steamid=$id;include_appinfo=1;include_played_free_games=1;include_free_sub=1}
  if($null -eq $owned.response.games){throw 'No game list returned. Set Steam Game Details privacy to Public.'}
  $rawGames=@($owned.response.games|Sort-Object {[int]$_.playtime_forever} -Descending);$logs=LocalSessions $root;$activity=MakeActivity @($logs.Sessions);$now=Get-Date
  $endMonth=if($now.Year -eq $Year){$now.Month}else{12};$games=New-Object 'System.Collections.Generic.List[object]';$allEvents=New-Object 'System.Collections.Generic.List[object]';$statCount=0;$statsAvailable=0;$idx=0
  foreach($raw in $rawGames){
    $idx++;$app=[int]$raw.appid;$name=if($raw.name){[string]$raw.name}else{"Steam app $app"};$icon='';if($raw.img_icon_url){$icon="https://media.steampowered.com/steamcommunity/public/images/apps/$app/$($raw.img_icon_url).jpg"}
    $tot=$activity.gameTotals[[string]$app];$yh=if($tot){[double]$tot.hours}else{$null}
    $g=[ordered]@{appId=$app;name=$name;playtimeForeverHours=[math]::Round([int]$raw.playtime_forever/60.0,2);playtime2WeeksHours=[math]::Round([int]$raw.playtime_2weeks/60.0,2);yearHoursExact=$yh
      yearSessions=if($tot){$tot.sessions}else{0};yearActiveDays=if($tot){$tot.activeDays}else{0};longestSessionSeconds=if($tot){$tot.longestSessionSeconds}else{0}
      iconUrl=$icon;achievements=$null;achievements2026=0;stats=@();statsAvailable=$false}
    Write-Progress -Activity 'Scanning Steam games' -Status "$idx / $($rawGames.Count): $name" -PercentComplete ([int](100*$idx/[math]::Max(1,$rawGames.Count)))
    $ach=Achievements $raw $id $key;if($ach.available){$g.achievements=[ordered]@{unlocked=$ach.unlocked;total=$ach.total;percent=$ach.percent}}
    if($ach.events.Count){$names=AchievementNames $app $key;foreach($e in $ach.events){if($names.ContainsKey($e.apiName) -and $names[$e.apiName]){$e.displayName=$names[$e.apiName]};$allEvents.Add($e);$m=([DateTimeOffset]::FromUnixTimeSeconds([long]$e.unlockTime).LocalDateTime).Month;if($m -le $activity.monthly.Count){$activity.monthly[$m-1].achievements++}};$g.achievements2026=$ach.events.Count}
    $ps=PlayerStats $app $id $key;$g.stats=@($ps.stats);$g.statsAvailable=[bool]$ps.available;$statCount++;if($ps.available){$statsAvailable++};$games.Add([pscustomobject]$g);Start-Sleep -Milliseconds 100
  }
  Write-Progress -Activity 'Scanning Steam games' -Completed;$events=@($allEvents.ToArray()|Sort-Object unlockTime);$achDays=@{};$activeGames=@{}
  foreach($e in $events){$d=([DateTimeOffset]::FromUnixTimeSeconds([long]$e.unlockTime).LocalDateTime).ToString('yyyy-MM-dd');$achDays[$d]=$true;$activeGames[[string]$e.appId]=$true}
  foreach($s in $activity.sessions){$activeGames[[string]$s.appId]=$true};$allDays=@{};foreach($d in $activity.daily){$allDays[$d.date]=$true};foreach($d in $achDays.Keys){$allDays[$d]=$true}
  $top=$games|Where-Object{$null -ne $_.yearHoursExact}|Sort-Object yearHoursExact -Descending|Select-Object -First 1;$busy=$activity.monthly|Sort-Object hours -Descending|Select-Object -First 1
  $life=0;$au=0;$at=0;foreach($r in $rawGames){$life+=[int]$r.playtime_forever};foreach($g in $games){if($g.achievements){$au+=$g.achievements.unlocked;$at+=$g.achievements.total}}
  $avg=if($activity.activeDays){[math]::Round($activity.totalHours/$activity.activeDays,2)}else{$null}
  $out=[ordered]@{
    schemaVersion=2;generatedAt=[DateTimeOffset]::Now.ToString('o');year=$Year
    yearToDate=[ordered]@{start="$Year-01-01";end=if($now.Year -eq $Year){$now.ToString('yyyy-MM-dd')}else{"$Year-12-31"};startMonth=1;endMonth=$endMonth;label="January – $($Months[$endMonth-1])"}
    source='steam-api';profile=[ordered]@{steamId=$id;name=if($player.personaname){[string]$player.personaname}else{'Steam player'};avatar=if($player.avatarfull){[string]$player.avatarfull}else{[string]$player.avatarmedium};url=if($player.profileurl){[string]$player.profileurl}else{"https://steamcommunity.com/profiles/$id/"}}
    summary=[ordered]@{totalGames=$games.Count;lifetimeHours=[math]::Round($life/60.0,2);yearHoursExact=if($activity.totalSessions){$activity.totalHours}else{$null};yearSessions=$activity.totalSessions
      yearActiveDays=$allDays.Count;averageHoursPerActiveDay=$avg;continuousDaysEquivalent=[math]::Round($activity.totalHours/24.0,2);eightHourDaysEquivalent=[math]::Round($activity.totalHours/8.0,2)
      sessionActiveDays=$activity.activeDays;achievementActiveDays=$achDays.Count;activeGames2026=$activeGames.Count;achievementUnlocked2026=$events.Count
      achievementsScanned=$au;achievementsAvailable=$at;statsGamesScanned=$statCount;statsGamesAvailable=$statsAvailable;averageSessionMinutes=$activity.averageSessionMinutes
      longestSessionSeconds=$activity.longestSessionSeconds;mostPlayedWeekday=$activity.mostPlayedWeekday;busiestMonth=if($busy.hours -gt 0){$busy.name}else{$null};topSessionGame=if($top){$top.name}else{$null}}
    history=[ordered]@{sessionLogsFound=($logs.Files.Count -gt 0);sessionLogFiles=@($logs.Files);sessionCount=$activity.totalSessions;firstSession=$activity.firstSession;lastSession=$activity.lastSession;achievementGamesScanned=$rawGames.Count;achievementGamesTotal=$games.Count;note='Playtime is reconstructed from paired local Steam start and exit log entries.'}
    activity=[ordered]@{monthly=@($activity.monthly);daily=@($activity.daily);weekdayHours=@($activity.weekdayHours);achievements=$events}
    topSessionGameAppId=if($top){[int]$top.appId}else{$null};thunderSkill=$null;games=@($games.ToArray())
  }
  $folder=Join-Path $env:USERPROFILE 'Downloads\SteamWrapped2026';New-Item -ItemType Directory -Path $folder -Force|Out-Null;$file=Join-Path $folder 'wrapped.json'
  [System.IO.File]::WriteAllText($file,($out|ConvertTo-Json -Depth 100),([System.Text.UTF8Encoding]::new($false)))
  Write-Host '';Write-Host 'Finished.' -ForegroundColor Green;Write-Host "Games: $($games.Count) | Sessions: $($activity.totalSessions) | Achievements: $($events.Count)"
  if($activity.totalSessions){Write-Host "Measured playtime: $($activity.totalHours) hours"}else{Write-Host 'No local session logs found; playtime will be blank.'}
  Write-Host "Saved: $file" -ForegroundColor Cyan;Write-Host 'Select wrapped.json using Import on the site.'
  Start-Process explorer.exe -ArgumentList ('"{0}"' -f $folder);Start-Process 'https://zerryh.github.io/steam-wrapped-2026/';Read-Host 'Press Enter to close'
}catch{Write-Host '';Write-Host "Steam Wrapped error: $($_.Exception.Message)" -ForegroundColor Red;Write-Host 'Check Steam Game Details privacy (Public) and your API key.';Read-Host 'Press Enter to close';exit 1}


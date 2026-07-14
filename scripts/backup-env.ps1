# Daily backup of SGF Central production .env → Z:\10. SGF CENTRAL\ENV
# Kept independent of the Node app; invoked by Task Scheduler.

$ErrorActionPreference = 'Stop'

$SourceEnv = 'C:\SGF\backend\.env'
$DestDir = 'Z:\10. SGF CENTRAL\ENV'
$FallbackLog = 'C:\SGF\scripts\backup-env.log'
$RetentionCount = 30

function Write-BackupLog {
  param(
    [string]$Message,
    [string]$PreferredLog
  )
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  $targets = @()
  if ($PreferredLog) { $targets += $PreferredLog }
  if ($FallbackLog -notin $targets) { $targets += $FallbackLog }

  foreach ($path in $targets) {
    try {
      $dir = Split-Path -Parent $path
      if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
      }
      Add-Content -LiteralPath $path -Value $line -Encoding UTF8
      return
    } catch {
      # try next target
    }
  }
}

$logPath = Join-Path $DestDir 'backup-env.log'

try {
  if (-not (Test-Path -LiteralPath 'Z:\')) {
    throw 'Z: drive is unavailable.'
  }

  if (-not (Test-Path -LiteralPath $DestDir)) {
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
  }

  if (-not (Test-Path -LiteralPath $SourceEnv)) {
    Write-BackupLog -Message "ERROR: source .env not found: $SourceEnv (no backups deleted)" -PreferredLog $logPath
    exit 1
  }

  $stamp = Get-Date -Format 'yyyy-MM-dd-HHmm'
  $destFile = Join-Path $DestDir ('.env-{0}' -f $stamp)

  Copy-Item -LiteralPath $SourceEnv -Destination $destFile -Force

  $backups = Get-ChildItem -LiteralPath $DestDir -File -ErrorAction Stop |
    Where-Object { $_.Name -match '^\.env-\d{4}-\d{2}-\d{2}' } |
    Sort-Object LastWriteTime -Descending

  if ($backups.Count -gt $RetentionCount) {
    $backups | Select-Object -Skip $RetentionCount | ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Force
    }
  }

  Write-BackupLog -Message "OK: backed up to $destFile" -PreferredLog $logPath
  exit 0
} catch {
  Write-BackupLog -Message ("ERROR: {0}" -f $_.Exception.Message) -PreferredLog $logPath
  exit 1
}

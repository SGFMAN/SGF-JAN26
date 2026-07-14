$ErrorActionPreference = 'Stop'
$taskName = 'SGF-Env-Backup'
$scriptPath = 'C:\SGF\scripts\backup-env.ps1'

# Remove existing task with same name if present (idempotent reinstall)
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
  -Execute 'PowerShell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At '12:00PM'

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Highest

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Daily noon backup of C:\SGF\backend\.env to Z:\10. SGF CENTRAL\ENV (keep 30 days)' |
  Out-Null

$info = Get-ScheduledTask -TaskName $taskName | Get-ScheduledTaskInfo
$task = Get-ScheduledTask -TaskName $taskName
@(
  "TaskName=$($task.TaskName)"
  "State=$($task.State)"
  "NextRunTime=$($info.NextRunTime)"
  "LastRunTime=$($info.LastRunTime)"
  "LastTaskResult=$($info.LastTaskResult)"
) | Set-Content -Path 'C:\SGF\scripts\backup-env-task-status.txt' -Encoding UTF8

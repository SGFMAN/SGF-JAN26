param(
  [Parameter(Mandatory = $true)]
  [string]$InitialDirectory
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms

if (-not (Test-Path -LiteralPath $InitialDirectory -PathType Container)) {
  [Console]::Error.WriteLine("Project folder was not found.")
  exit 2
}

$folder = (Resolve-Path -LiteralPath $InitialDirectory).Path
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Opacity = 0
$owner.Show()

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.AutoUpgradeEnabled = $false
$dialog.InitialDirectory = $folder
$dialog.Filter = "Archicad PLN (*.pln)|*.pln"
$dialog.Title = "Import PLN"
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
$dialog.RestoreDirectory = $false
$dialog.FileName = ""

$result = $dialog.ShowDialog($owner)
$owner.Close()
$owner.Dispose()

if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
  exit 0
}

[Console]::Out.WriteLine($dialog.FileName)
exit 0

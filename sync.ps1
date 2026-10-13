# Sincroniza cambios con GitHub (commit + push)
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir
$git = "C:\Program Files\Git\cmd\git.exe"
if (-not (Test-Path $git)) { $git = "git" }

& $git add -A
$status = & $git status --porcelain
if (-not $status) {
    Write-Host "No hay cambios para subir."
    exit 0
}
$msg = "Actualizacion $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
& $git commit -m $msg
& $git push
Write-Host "Subido a GitHub. Pages se actualiza en 1-2 minutos."
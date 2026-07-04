$StartupFolder = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupFolder "Continuity.lnk"
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "C:\Users\z1635\Desktop\vibe coding\tool\start-server.bat"
$Shortcut.WorkingDirectory = "C:\Users\z1635\Desktop\vibe coding\tool"
$Shortcut.WindowStyle = 7
$Shortcut.Save()
Write-Host "Shortcut created at: $ShortcutPath"

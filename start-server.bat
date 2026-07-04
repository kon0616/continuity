@echo off
set "NODE_PATH=C:\Program Files\nodejs"
set "PROJECT=C:\Users\z1635\Desktop\vibe coding\tool"
cd /d "%PROJECT%"
"%NODE_PATH%\node.exe" "%PROJECT%\scripts\kill-port.js" 3000
"%NODE_PATH%\node.exe" "%PROJECT%\node_modules\next\dist\bin\next" start -p 3000

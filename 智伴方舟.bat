@echo off
rem 智伴方舟
rem 双击本文件即可启动前后端，无需先 cd 到项目目录。
rem 脚本会自行进入本 bat 所在的项目根目录，再调用同名的 ps1。
rem 默认后端 8001、前端 3000；端口被占用时自动复用本项目旧进程，或改用下一个空闲端口。
rem 两个服务都响应后，用默认浏览器打开前端页面。
rem 停止服务：关闭标题为「智伴方舟-后端」「智伴方舟-前端」的窗口。
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& ([System.IO.Path]::ChangeExtension('%~f0', '.ps1'))"
if errorlevel 1 pause
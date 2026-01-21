@echo off
echo ====================================
echo 任务确认板系统启动脚本
echo ====================================
echo.

echo 检查Node.js安装...
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到Node.js，请先安装Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js已安装
echo.

echo 检查依赖包...
if not exist "node_modules\" (
    echo 首次运行，正在安装依赖包...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo 依赖安装完成！
    echo.
)

echo 启动服务器...
echo.
echo ====================================
echo 访问地址:
echo   本机: http://localhost:5001
echo   局域网: http://192.168.0.226:5001
echo ====================================
echo.
echo 按 Ctrl+C 可停止服务器
echo.

node server.js

pause


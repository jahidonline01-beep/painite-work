@echo off
echo Building Painite Work Windows App...
npm install
npm run build
npx electron-builder --windows
echo Done! Output in dist_electron folder.
pause

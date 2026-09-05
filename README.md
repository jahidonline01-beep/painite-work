# Painite Work - Desktop & Mobile Application

## GitHub Actions Automated Builds
This repository contains automated GitHub Workflows in `.github/workflows/`:
- `windows.yml`: Builds Windows Portable `.exe` executable upon commit.
- `android.yml`: Builds Android `.apk` application package upon commit.

## Flat Root & Standard Structure Support
This repository supports both standard Vite (`src/...`) and flat-root file structures on GitHub. The GitHub Workflows automatically organize flat root files prior to building.

## Local Running & Building
- **Run Web Dev**: `npm run dev` or run `RUN_LOCAL.bat`
- **Build Windows EXE**: `npm run build` then `npx electron-builder --windows portable` or run `BUILD_WINDOWS.bat`

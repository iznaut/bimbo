#!/usr/bin/env pwsh

git pull
npx @electron/packager . --extra-resource project-starters/ --ignore project-starters/ --overwrite --out build/
butler push build/bimbo-win32-x64 iznaut/bimbo:windows-beta --if-changed
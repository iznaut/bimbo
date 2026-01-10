#!/usr/bin/env bash

npx @electron/packager . --extra-resource project-starters/ --ignore project-starters/ --overwrite --out build/
butler push build/bimbo-darwin-arm64 iznaut/bimbo:mac-beta --if-changed
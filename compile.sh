#!/bin/bash

TEST_TARGET_DIR="./test"

MAIN_JS="./main.js"
BIN_DIR="./bin"
EXAMPLE_PROJECT_DIR="./example-project"
OUTFILE_PREFIX="bimbo"

declare -A targets
targets[win]="bun-windows-x64"
targets[mac]="bun-darwin-arm64"
targets[mac-intel]="bun-darwin-x64"
targets[linux]="bun-linux-x64"

for key in "${!targets[@]}"; do
    bun build $MAIN_JS --compile --minify --sourcemap --bytecode --target=${targets[${key}]} --outfile $BIN_DIR/$OUTFILE_PREFIX-$key
done

# create example project zip
pushd $EXAMPLE_PROJECT_DIR
rm -rf ./public
rm ../$BIN_DIR/example.zip
zip -r ../$BIN_DIR/example.zip *
popd

# uncomment for testing
# cp ./bin/bimbo-mac $TEST_TARGET_DIR/bimbo-mac
# cp ./bin/example.zip $TEST_TARGET_DIR/example.zip

mkdir $TEST_TARGET_DIR
rm -rf $TEST_TARGET_DIR/*
cp ./bin/example.zip $TEST_TARGET_DIR/example.zip
# ./bin/bimbo-mac --path .$TEST_TARGET_DIR

# sleep 3
# echo "testing" >> "./content/index.md"
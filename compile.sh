#!/bin/zsh

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

for key value in ${(kv)targets}; do
    bun build $MAIN_JS --compile --minify --sourcemap --bytecode --target=${value} --outfile $BIN_DIR/$OUTFILE_PREFIX-${key}
done

# build only for current OS
# bun build $MAIN_JS --compile --minify --sourcemap --bytecode --target=${targets[$OSTYPE]} --outfile $BIN_DIR/$OUTFILE_PREFIX-$OSTYPE

# create example project zip
pushd $EXAMPLE_PROJECT_DIR
rm -rf ./public
rm ../$BIN_DIR/example.zip
zip -r ../$BIN_DIR/example.zip *
popd

# uncomment for testing
# cd $BIN_DIR
# mkdir $TEST_TARGET_DIR
# rm -rf $TEST_TARGET_DIR/*
# cp ./example.zip $TEST_TARGET_DIR/example.zip
# ./bimbo-$OSTYPE --path $TEST_TARGET_DIR
set -e

cd "$(dirname "$0")"
cd rust

mkdir -p ../rust-dist
rm -rf ../rust-dist/*

cargo build --release
mv target/release/server ../rust-dist/server
mv target/release/worker ../rust-dist/worker
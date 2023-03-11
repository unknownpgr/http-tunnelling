set -e

cd "$(dirname "$0")"

mkdir -p rust-dist
rm -rf rust-dist/*

cd rust
cargo build --release
mv target/release/server ../rust-dist/server
mv target/release/worker ../rust-dist/worker
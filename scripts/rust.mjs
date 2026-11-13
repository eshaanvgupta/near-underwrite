import { spawnSync } from "node:child_process";
import { cwd, exit } from "node:process";

const mode = process.argv[2];
const commands = {
  test: "CARGO_TARGET_DIR=/tmp/near-underwrite-target cargo test --manifest-path contracts/registry/Cargo.toml",
  build: "cargo build --manifest-path contracts/registry/Cargo.toml --target wasm32-unknown-unknown --release",
  sandbox: "cargo build --manifest-path contracts/registry/Cargo.toml --target wasm32-unknown-unknown --release && cargo test --manifest-path contracts/registry/Cargo.toml --test sandbox -- --ignored --nocapture",
};

if (!commands[mode]) {
  console.error("Usage: node scripts/rust.mjs <test|build|sandbox>");
  exit(2);
}

let result;
if (process.platform === "win32") {
  const linuxPath = cwd().replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replaceAll("\\", "/");
  result = spawnSync("wsl.exe", ["-d", "Ubuntu-24.04", "bash", "-lc", `cd '${linuxPath}' && ${commands[mode]}`], { stdio: "inherit" });
} else {
  result = spawnSync("bash", ["-lc", commands[mode]], { stdio: "inherit" });
}
exit(result.status ?? 1);

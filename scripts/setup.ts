/**
 * One-time setup (safe to re-run): downloads the free voice model + lip-sync tool,
 * and copies flags/fonts into Remotion's public folder.
 *   npm run setup
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, ".cache");
const MODELS = path.join(CACHE, "models");
const BIN = path.join(CACHE, "bin");
const PUBLIC = path.join(ROOT, "public");

const KOKORO_BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0";
const RHUBARB_VERSION = "1.14.0";

async function download(url: string, dest: string) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`✔ already have ${path.basename(dest)}`);
    return;
  }
  console.log(`↓ ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status}: ${url}`);
  const tmp = dest + ".part";
  await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(tmp));
  fs.renameSync(tmp, dest);
  console.log(`✔ saved ${path.basename(dest)} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
}

async function setupRhubarb() {
  const plat = process.platform === "win32" ? "Windows" : process.platform === "darwin" ? "macOS" : "Linux";
  const dir = path.join(BIN, `Rhubarb-Lip-Sync-${RHUBARB_VERSION}-${plat}`);
  const exe = path.join(dir, process.platform === "win32" ? "rhubarb.exe" : "rhubarb");
  if (fs.existsSync(exe)) {
    console.log("✔ Rhubarb already installed");
    return;
  }
  const zip = path.join(BIN, `rhubarb-${plat}.zip`);
  await download(
    `https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v${RHUBARB_VERSION}/Rhubarb-Lip-Sync-${RHUBARB_VERSION}-${plat}.zip`,
    zip,
  );
  // tar ships with Windows 10+ and extracts .zip; Linux/macOS use unzip.
  execSync(process.platform === "win32" ? `tar -xf "${zip}" -C "${BIN}"` : `unzip -q -o "${zip}" -d "${BIN}"`, {
    stdio: "inherit",
  });
  if (process.platform !== "win32") fs.chmodSync(exe, 0o755);
  fs.rmSync(zip);
  console.log("✔ Rhubarb installed");
}

function copyAssets() {
  // Flags (MIT, flag-icons)
  const flagsSrc = path.join(ROOT, "node_modules", "flag-icons", "flags", "4x3");
  const flagsDst = path.join(PUBLIC, "flags");
  fs.mkdirSync(flagsDst, { recursive: true });
  for (const f of fs.readdirSync(flagsSrc)) fs.copyFileSync(path.join(flagsSrc, f), path.join(flagsDst, f));

  // Fonts (OFL, via @fontsource)
  const fontsDst = path.join(PUBLIC, "fonts");
  fs.mkdirSync(fontsDst, { recursive: true });
  const fonts: [string, string][] = [
    ["oswald", "oswald-latin-500-normal.woff2"],
    ["oswald", "oswald-latin-600-normal.woff2"],
    ["oswald", "oswald-latin-700-normal.woff2"],
    ["inter", "inter-latin-500-normal.woff2"],
    ["inter", "inter-latin-700-normal.woff2"],
    ["inter", "inter-latin-800-normal.woff2"],
  ];
  for (const [pkg, file] of fonts) {
    fs.copyFileSync(path.join(ROOT, "node_modules", "@fontsource", pkg, "files", file), path.join(fontsDst, file));
  }
  console.log("✔ flags and fonts copied to public/");
}

async function main() {
  fs.mkdirSync(MODELS, { recursive: true });
  fs.mkdirSync(BIN, { recursive: true });
  await download(`${KOKORO_BASE}/kokoro-v1.0.int8.onnx`, path.join(MODELS, "kokoro-v1.0.int8.onnx"));
  await download(`${KOKORO_BASE}/voices-v1.0.bin`, path.join(MODELS, "voices-v1.0.bin"));
  // AI lip-sync model (Wav2Lip GAN, ONNX build hosted by the FaceFusion project)
  await download(
    "https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/wav2lip_gan_96.onnx",
    path.join(MODELS, "wav2lip_gan_96.onnx"),
  );
  await setupRhubarb();
  copyAssets();
  console.log("\nSetup complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

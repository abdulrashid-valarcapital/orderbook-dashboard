const fs = require("fs");
const childProcess = require("child_process");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");

async function main() {
  const [sourceUrl, start, end, method, outputPath] = process.argv.slice(2);
  if (!sourceUrl || !start || !end || !method || !outputPath) {
    throw new Error("Usage: node extract-remote-zip-member.js <url> <start> <end> <method> <output>");
  }

  const curl = childProcess.spawn("curl", [
    "-L",
    "--fail",
    "--range",
    `${start}-${end}`,
    sourceUrl,
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  curl.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const output = fs.createWriteStream(outputPath);
  const input = Number(method) === 8
    ? curl.stdout.pipe(zlib.createInflateRaw())
    : curl.stdout;

  await pipeline(input, output);

  const exitCode = await new Promise((resolve) => {
    curl.on("close", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `curl exited with code ${exitCode}`);
  }
}

main().catch((error) => {
  try {
    if (process.argv[6] && fs.existsSync(process.argv[6])) fs.unlinkSync(process.argv[6]);
  } catch (_) {
    // Best-effort cleanup before reporting the real extraction error.
  }
  console.error(error.message);
  process.exit(1);
});

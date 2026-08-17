const fs = require("fs");
const childProcess = require("child_process");
const zlib = require("zlib");

async function main() {
  const [sourceUrl, start, end, method, skipBytes, takeBytes, outputPath] = process.argv.slice(2);
  if (!sourceUrl || !start || !end || !method || !skipBytes || !takeBytes || !outputPath) {
    throw new Error("Usage: node extract-remote-zip-slice.js <url> <start> <end> <method> <skip> <take> <output>");
  }

  const skip = Number(skipBytes);
  const take = Number(takeBytes);
  if (!Number.isFinite(skip) || !Number.isFinite(take) || skip < 0 || take < 0) {
    throw new Error("Invalid skip/take byte range");
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

  const input = Number(method) === 8
    ? curl.stdout.pipe(zlib.createInflateRaw())
    : curl.stdout;
  const output = fs.createWriteStream(outputPath);

  let seen = 0;
  let written = 0;
  let settled = false;

  await new Promise((resolve, reject) => {
    function finish() {
      if (settled) return;
      settled = true;
      output.end(resolve);
      curl.kill("SIGTERM");
      input.destroy();
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      curl.kill("SIGTERM");
      output.destroy();
      reject(error);
    }

    input.on("data", (chunk) => {
      if (written >= take) {
        finish();
        return;
      }

      const chunkStart = seen;
      const chunkEnd = seen + chunk.length;
      seen = chunkEnd;

      const writeStart = Math.max(skip, chunkStart);
      const writeEnd = Math.min(skip + take, chunkEnd);
      if (writeEnd > writeStart) {
        const localStart = writeStart - chunkStart;
        const localEnd = writeEnd - chunkStart;
        output.write(chunk.subarray(localStart, localEnd));
        written += localEnd - localStart;
      }

      if (written >= take) finish();
    });

    input.on("end", () => {
      if (written < take) {
        fail(new Error(`Only wrote ${written} of ${take} requested bytes`));
        return;
      }
      finish();
    });
    input.on("error", (error) => {
      if (!settled) fail(error);
    });
    output.on("error", fail);
    curl.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        fail(new Error(stderr.trim() || `curl exited with code ${code}`));
      }
    });
  });
}

main().catch((error) => {
  try {
    if (process.argv[8] && fs.existsSync(process.argv[8])) fs.unlinkSync(process.argv[8]);
  } catch (_) {
    // Best-effort cleanup before reporting the real extraction error.
  }
  console.error(error.message);
  process.exit(1);
});

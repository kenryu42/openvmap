import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { rootCertificates } from "node:tls";

const port = process.env.PORT ?? "3000";
const workerPort = process.env.WORKER_PORT ?? "8787";
const lanAddresses = Object.values(networkInterfaces()).flatMap((list) => (list ?? []).filter((a) => a.family === "IPv4" && !a.internal).map((a) => a.address));
const devHosts = ["127.0.0.1", ...lanAddresses];

const wranglerAssetsDirMustExist = "out";

mkdirSync(wranglerAssetsDirMustExist, { recursive: true });
// The local Workers runtime trusts the system's CA file, which on macOS lacks
// newer roots such as GlobalSign Root R46, so https to sites under them fails
// as "cannot connect". Give it the current Mozilla roots that ship with Bun.
// Deployed, the Worker uses Cloudflare's trust store instead.
mkdirSync(".wrangler", { recursive: true });
writeFileSync(".wrangler/roots.pem", rootCertificates.join("\n") + "\n");
const worker = spawn("wrangler", ["dev", "--ip", "127.0.0.1", "--port", workerPort], {
  stdio: "inherit",
  env: { ...process.env, SSL_CERT_FILE: ".wrangler/roots.pem" },
});

const next = spawn("next", ["dev", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, VMAP_DEV_API: `http://127.0.0.1:${workerPort}`, VMAP_DEV_HOSTS: devHosts.join(",") },
});
const children: ChildProcess[] = [next, worker];

for (const address of lanAddresses) console.log(`\n  On this network: http://${address}:${port}/`);

const stop = () => children.forEach((c) => c.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
next.on("exit", (code) => {
  stop();
  process.exit(code ?? 0);
});

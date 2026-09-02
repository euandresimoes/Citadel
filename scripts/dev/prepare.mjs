import { execFileSync } from "node:child_process";

const project = process.env.CITADELA_DOCKER_PROJECT ?? "citadela-dev";
const container = process.env.CITADELA_POSTGRES_CONTAINER ?? `${project}-postgres-1`;
const port = process.env.CITADELA_POSTGRES_PORT ?? "5433";
const composeFile = "infrastructure/docker-compose.yml";
function docker(args, env = process.env) { return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env }).trim(); }
try { docker(["start", container]); } catch { docker(["compose", "-p", project, "-f", composeFile, "up", "-d", "postgres"], { ...process.env, POSTGRES_PORT: port }); }
docker(["compose", "-p", project, "-f", composeFile, "up", "-d", "gateway"], { ...process.env, POSTGRES_PORT: port });
for (let attempt = 0; attempt < 30; attempt += 1) {
  try { if (docker(["inspect", "--format", "{{.State.Health.Status}}", container]) === "healthy") { console.log(`PostgreSQL container ${container} is healthy.`); process.exit(0); } } catch { /* wait for Docker Compose to create the container */ }
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
console.error("PostgreSQL did not become healthy within 60 seconds.");
process.exit(1);

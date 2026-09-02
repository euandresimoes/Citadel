const url = process.env.CITADELA_HUB_HEALTH_URL ?? "http://127.0.0.1:4174/api/v1/setup/status";
for (let attempt = 0; attempt < 30; attempt += 1) {
  try { const response = await fetch(url); if (response.ok) { console.log(`Hub API is ready at ${url}.`); process.exit(0); } } catch { /* wait for the Hub process */ }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
console.error(`Hub API did not become ready at ${url}.`);
process.exit(1);

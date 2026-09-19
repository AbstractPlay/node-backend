import { diffApbackLocales, resolveNodeBackendRoot } from "./sync-apback-locales.mjs";

const { ok, mismatches } = await diffApbackLocales();
if (ok) {
    console.log(`apback locales match node-backend (${resolveNodeBackendRoot()})`);
    process.exit(0);
}

console.error("Vendored src/locales/*/apback.json is out of date with node-backend:");
for (const m of mismatches) {
    console.error(`  ${m.lang}: ${m.expected} (${m.actual})`);
}
console.error("Run: npm run sync-apback-locales");
process.exit(1);

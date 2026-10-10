import { spawnSync } from "node:child_process";

function runNpmJson(args, allowedStatuses) {
  const result = spawnSync("npm", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw new Error(`Could not run npm ${args.join(" ")}: ${result.error.message}`);
  if (result.status === null) throw new Error(`npm ${args.join(" ")} did not finish successfully.`);
  if (!allowedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.status}`;
    throw new Error(`npm ${args.join(" ")} failed: ${detail}`);
  }

  try {
    return JSON.parse(result.stdout || "{}");
  } catch {
    throw new Error(`npm ${args.join(" ")} did not return valid JSON.`);
  }
}

try {
  // npm outdated exits with status 1 when it finds outdated packages.
  const outdated = runNpmJson(["outdated", "--json", "--all"], [0, 1]);
  // npm audit exits with status 1 when its report contains vulnerabilities.
  const audit = runNpmJson(["audit", "--json"], [0, 1]);
  const outdatedPackages = Object.entries(outdated).flatMap(([name, result]) => {
    const entries = Array.isArray(result) ? result : [result];
    const installedEntry = entries.find((entry) => typeof entry.current === "string");
    // npm --all includes optional binaries for other operating systems; they are not stale locally.
    return installedEntry ? [[name, installedEntry]] : [];
  });
  const vulnerabilities = Object.entries(audit.vulnerabilities ?? {});
  const severityCounts = audit.metadata?.vulnerabilities ?? {};

  console.log("Repository dependency check (read-only)");
  console.log(`Outdated packages: ${outdatedPackages.length}`);
  for (const [name, details] of outdatedPackages) {
    const current = details.current ?? "not installed";
    const wanted = details.wanted ?? "unknown";
    const latest = details.latest ?? "unknown";
    const location = details.location ? ` [${details.location}]` : "";
    console.log(`- ${name}: ${current} -> wanted ${wanted} -> latest ${latest}${location}`);
  }

  const totalVulnerabilities = typeof severityCounts.total === "number"
    ? severityCounts.total
    : ["info", "low", "moderate", "high", "critical"].reduce(
      (total, severity) => total + (typeof severityCounts[severity] === "number" ? severityCounts[severity] : 0),
      0,
    );
  console.log(`Known vulnerabilities: ${totalVulnerabilities}`);
  for (const [name, details] of vulnerabilities) {
    const fix = details.fixAvailable === true ? "fix available" : "review required";
    console.log(`- ${name}: ${details.severity ?? "unknown severity"} (${details.isDirect ? "direct" : "transitive"}; ${fix})`);
  }

  console.log("No packages or lockfiles were changed.");
  if (outdatedPackages.length > 0 || totalVulnerabilities > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}

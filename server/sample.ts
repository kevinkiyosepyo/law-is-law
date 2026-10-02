import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseTextExport } from "./digest.ts";
import type { MatterSnapshot } from "../shared/types.ts";

export function loadSample(): MatterSnapshot {
  const configuredPath = process.env.SAMPLE_CASE_PATH;
  const suppliedPath =
    configuredPath ||
    "/Users/kevinpoopz/Desktop/Law is law/sapini-case-file.txt";
  try {
    const sample = parseTextExport(
      readFileSync(suppliedPath, "utf8"),
      "sample",
    );
    sample.warnings.unshift(
      "Sample mode: this is a local case export, not a verified live Clio connection.",
    );
    return sample;
  } catch (error) {
    if (configuredPath)
      throw new Error(
        `Cannot load SAMPLE_CASE_PATH: ${error instanceof Error ? error.message : String(error)}`,
      );
    const sample = parseTextExport(
      readFileSync(
        fileURLToPath(new URL("../fixtures/example-case.txt", import.meta.url)),
        "utf8",
      ),
      "sample",
    );
    sample.warnings.unshift(
      "Synthetic sample: all people, providers, amounts, and events in this fallback fixture are fictional.",
    );
    return sample;
  }
}

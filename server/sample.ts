import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseTextExport } from "./digest.ts";
import type { MatterSnapshot } from "../shared/types.ts";
import type { Store } from "./store.ts";

export function loadKevinPyoSample(): MatterSnapshot {
  const sample = parseTextExport(
    readFileSync(
      new URL("../fixtures/kevin-pyo-car-crash.txt", import.meta.url),
      "utf8",
    ),
    "sample",
  );
  sample.warnings.unshift(
    "Fictional demonstration: Kevin Pyo is a demo character. All incidents, organizations, treatment, correspondence, and amounts in this matter are invented.",
  );
  return sample;
}

/** Add missing demos without replacing an existing matter or cached import. */
export function seedSamples(
  store: Pick<Store, "listMatters" | "getMatter" | "saveMatter">,
) {
  if (!store.listMatters().some((m) => m.sourceMode === "sample"))
    store.saveMatter(loadSample());
  // The larger walkthrough fixture is optional in local copies of this repo.
  if (existsSync(new URL("../fixtures/kevin-pyo-car-crash.txt", import.meta.url))) {
    const kevin = loadKevinPyoSample();
    if (!store.getMatter(kevin.id)) store.saveMatter(kevin);
  }
  for (const filename of ["maya-torres-slip-fall.txt", "ethan-brooks-dog-bite.txt", "nina-patel-rideshare.txt"]) {
    const sample = parseTextExport(readFileSync(new URL(`../fixtures/${filename}`, import.meta.url), "utf8"), "sample");
    sample.warnings.unshift("Fictional demonstration: all people, providers, incidents, treatment, and amounts in this case are invented.");
    if (!store.getMatter(sample.id)) store.saveMatter(sample);
  }
}

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

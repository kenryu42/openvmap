import { readFileSync } from "node:fs";
import path from "node:path";
import { loadProviders, type Table } from "./provider";

export const table: Table = loadProviders(readFileSync(path.join(process.cwd(), "data", "providers.yaml"), "utf8"));

import { readFileSync } from "node:fs";
import path from "node:path";
import { loadAdvisories } from "./advisory";
import { loadProviders, type Table } from "./provider";

const dataFile = (name: string) => readFileSync(path.join(process.cwd(), "data", name), "utf8");

export const advisories = loadAdvisories(dataFile("advisories.yaml"));
export const table: Table = loadProviders(dataFile("providers.yaml"), advisories);

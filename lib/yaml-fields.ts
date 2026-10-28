export function fieldReaders(file: string) {
  function obj(v: unknown, what: string): Record<string, unknown> {
    if (v === null || v === undefined) return {};
    if (typeof v !== "object" || Array.isArray(v)) throw new Error(`${file}: ${what} is not a mapping`);
    return v as Record<string, unknown>;
  }

  function list_(v: unknown, what: string): unknown[] {
    if (v === null || v === undefined) return [];
    if (!Array.isArray(v)) throw new Error(`${file}: ${what} is not a list`);
    return v;
  }

  function strs(v: unknown, what: string): string[] {
    return list_(v, what).map((s) => {
      if (typeof s !== "string") throw new Error(`${file}: ${what}: ${JSON.stringify(s)} is not a string`);
      return s;
    });
  }

  function str(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    throw new Error(`${file}: ${JSON.stringify(v)} is not a string`);
  }

  return { obj, list_, strs, str };
}

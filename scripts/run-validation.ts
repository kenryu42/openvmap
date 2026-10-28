export function runValidation(okMessage: string, validate: () => string[]): void {
  let errors: string[];
  try {
    errors = validate();
  } catch (err) {
    errors = [err instanceof Error ? err.message : String(err)];
  }
  for (const e of errors) console.error(e);
  if (errors.length > 0) process.exit(1);
  console.log(okMessage);
}

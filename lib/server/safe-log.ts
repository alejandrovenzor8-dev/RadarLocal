export function logServerError(operation: string, error: unknown): void {
  const value = error && typeof error === "object" && "cause" in error && error.cause ? error.cause : error;
  const rawCode = value && typeof value === "object" && "code" in value ? value.code : undefined;
  const code = typeof rawCode === "string" && /^[A-Za-z0-9_]{1,24}$/.test(rawCode) ? rawCode : "UNEXPECTED";
  console.error(JSON.stringify({ operation, code, incidentId: crypto.randomUUID() }));
}

/** Minimal JSON Schema (draft-07 subset) validator: enough for the Codex hook schemas. Test-only. */
type Schema = Record<string, any> | boolean;

export function validate(schema: Schema, value: unknown, root: Schema = schema, at = '$'): string[] {
  const errs: string[] = [];
  const s = resolve(schema, root) as Record<string, any> | boolean | undefined;
  if (s === true || s === undefined || s === false) return errs;
  if (s.allOf) for (const sub of s.allOf) errs.push(...validate(sub, value, root, at));
  if (s.const !== undefined && value !== s.const) errs.push(`${at}: expected const ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(value)) errs.push(`${at}: ${JSON.stringify(value)} not in enum`);
  if (s.type) {
    const types: string[] = Array.isArray(s.type) ? s.type : [s.type];
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!types.includes(actual)) {
      errs.push(`${at}: expected ${types.join('|')}, got ${actual}`);
      return errs;
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const r of s.required ?? []) if (!(r in obj)) errs.push(`${at}: missing required "${r}"`);
    for (const [k, v] of Object.entries(obj)) {
      if (s.properties && k in s.properties) errs.push(...validate(s.properties[k], v, root, `${at}.${k}`));
      else if (s.additionalProperties === false) errs.push(`${at}: unexpected property "${k}"`);
    }
  }
  return errs;
}

function resolve(s: Schema, root: Schema): Schema {
  if (s && typeof s === 'object' && typeof s.$ref === 'string') {
    const name = s.$ref.replace('#/definitions/', '');
    return resolve((root as Record<string, any>).definitions?.[name], root);
  }
  return s;
}

/** Drops our own `_provenance`-style annotation keys before validating a fixture. */
export const stripAnnotations = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));

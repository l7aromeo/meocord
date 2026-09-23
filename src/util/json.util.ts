/** Makes tsconfig-style JSON parseable: strips line comments, trailing commas and newlines. */
export function fixJSON(jsonString: string): string {
  return jsonString
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas before } or ]
    .replace(/,\s*$/, '') // Remove trailing commas at the end of the file
    .replace(/^\s*[\r\n]/gm, '') // Replace empty lines only
}

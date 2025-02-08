/**
 * Helper function to fix common JSON formatting issues in tsconfig.json, such as:
 * - Removing single-line comments.
 * - Removing trailing commas.
 * - Stripping newlines.
 *
 * @param {string} jsonString - The raw JSON string to fix.
 * @returns {string} The corrected JSON string.
 */
export function fixJSON(jsonString: string): string {
  return jsonString
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas before } or ]
    .replace(/,\s*$/, '') // Remove trailing commas at the end of the file
    .replace(/^\s*[\r\n]/gm, '') // Replace empty lines only
}

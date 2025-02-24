/**
 * MeoCord Framework
 * Copyright (C) 2025 Ukasyah Rahmatullah Zada
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

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

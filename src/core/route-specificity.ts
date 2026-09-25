/**
 * How specific a route pattern is, for ranking the patterns that can match one input: more literal
 * text first, then a fixed length before one taking the rest, then no optional param before one, then
 * fewer params. Component patterns count literal characters; message patterns count literal words.
 */
export function routeSpecificity({
  literals,
  params,
  rest = false,
  optional = false,
}: {
  literals: number
  params: number
  rest?: boolean
  optional?: boolean
}): number {
  return literals * 1_000 - (rest ? 500 : 0) - (optional ? 250 : 0) - params
}

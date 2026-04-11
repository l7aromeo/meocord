/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

export default function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

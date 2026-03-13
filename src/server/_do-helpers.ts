import type { OrgDurableObject } from '@/do/org-durable-object'

/**
 * Get a typed RPC stub for the org's Durable Object.
 * Uses deterministic ID from orgId (UUID) → stable 1:1 mapping.
 *
 * Separated from _helpers.ts to avoid pulling @tanstack/react-start/server
 * into client bundles via transitive imports.
 */
export function getOrgStub(
  env: Cloudflare.Env,
  orgId: string,
): DurableObjectStub<OrgDurableObject> {
  const doId = env.ORG_DO.idFromName(orgId)
  return env.ORG_DO.get(doId)
}

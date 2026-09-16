const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The backend demo seed owns this UUID. Display/route slugs never cross the API boundary.
const deterministicBackendStoryIds: Readonly<Record<string, string>> = {
  "fog-harbor": "2c600001-0000-4000-8000-000000000001",
};

export function isBackendUuid(value: string) {
  return UUID.test(value);
}

export function backendStoryIdFor(routeStoryId: string): string | null {
  if (isBackendUuid(routeStoryId)) return routeStoryId;
  return deterministicBackendStoryIds[routeStoryId] ?? null;
}

export function assertBackendStoryId(routeStoryId: string) {
  const backendStoryId = backendStoryIdFor(routeStoryId);
  if (!backendStoryId || !isBackendUuid(backendStoryId)) {
    throw new Error("当前 Story 尚未绑定 backend UUID；已保留在本地开发模式。");
  }
  return backendStoryId;
}

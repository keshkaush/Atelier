/* ============================================================
   The active host. Milestone 1 ships the mock. A future local
   adapter (Node companion / Tauri) becomes the default here —
   selected by env or build target — with no change above this line.
   ============================================================ */

import type { HostBridge } from './types';
import { mockHost } from './mockHost';

export const host: HostBridge = mockHost;

export * from './types';
export { SAMPLE_PROJECTS, sampleById } from './samples';
export type { SampleProject } from './samples';

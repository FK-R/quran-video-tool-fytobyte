/** DTOs shared by API routes (server) and UI (client). Type-only module. */
export type ProjectStatus = "DRAFT" | "OVERLAYS_READY" | "VIDEO_READY" | "RENDERED";
export type RenderStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface SegmentDTO {
  id: string;
  ayah: number;
  segment: number;
  arabic: string;
  translation: string;
  wordCount: number;
  startTime: number | null;
  endTime: number | null;
  hasOverlay: boolean;
  overlayVersion: number;
}

export interface VideoDTO {
  originalName: string;
  sizeBytes: number;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  videoCodec: string | null;
}

export interface RenderJobDTO {
  id: string;
  status: RenderStatus;
  progress: number;
  error: string | null;
  hasOutput: boolean;
}

export interface ProjectDTO {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  segments: SegmentDTO[];
  video: VideoDTO | null;
  renderJob: RenderJobDTO | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
  segmentCount: number;
}

import fs from "node:fs/promises";
import path from "node:path";

/** All user files live under STORAGE_DIR. DB rows store paths RELATIVE to it (portable between hosts). */
export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? "./storage");

export const abs = (rel: string) => path.join(STORAGE_DIR, rel);
export const projectRel = (id: string) => `projects/${id}`;
export const projectDir = (id: string) => abs(projectRel(id));
export const overlayDir = (id: string) => path.join(projectDir(id), "overlays");
export const videoDir = (id: string) => path.join(projectDir(id), "video");
export const outputDir = (id: string) => path.join(projectDir(id), "output");

export const ensureDir = (dir: string) => fs.mkdir(dir, { recursive: true });
export const removePath = (p: string) => fs.rm(p, { recursive: true, force: true });

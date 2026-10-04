import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { abs, ensureDir, overlayDir, projectRel } from "@/lib/storage";
import path from "node:path";
import sharp from "sharp";

export const OVERLAY_W = 1920;
export const OVERLAY_H = 1080;

const ARABIC_FONT = process.env.ARABIC_FONT ?? "Amiri";
const LATIN_FONT = process.env.LATIN_FONT ?? "Noto Sans";
const TEXT_MAX_W = 1560;
const PAD_X = 80;
const PAD_Y = 48;
const GAP = 36;
const BOTTOM_MARGIN = 90;
const MAX_PANEL_H = 640;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface TextImg {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Text is rasterised by Pango (via libvips/sharp) which performs proper Arabic shaping,
 * bidi (rtl) and word wrapping. Hand-rolled canvas wrapping gets Arabic joins wrong.
 */
async function renderText(
  text: string,
  o: { font: string; size: number; color: string; spacing: number },
): Promise<TextImg> {
  const span = `<span foreground="${o.color}">${esc(text)}</span>`;
  const { data, info } = await sharp({
    text: {
      text: span,
      font: `${o.font} ${o.size}`,
      width: TEXT_MAX_W,
      align: "center",
      rgba: true,
      spacing: o.spacing,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

/** Renders one transparent 1920x1080 PNG card: Arabic (RTL) on top, translation (LTR) beneath. */
export async function renderOverlayCard(
  arabic: string,
  translation: string,
  outFile: string,
) {
  const sizes = [88, 76, 64, 54, 46]; // shrink until the card fits
  for (let i = 0; i < sizes.length; i++) {
    const arSize = sizes[i];
    const ar = await renderText(arabic, {
      font: ARABIC_FONT,
      size: arSize,
      color: "#FFFFFF",
      spacing: Math.round(arSize * 0.25),
    });
    const tr = translation
      ? await renderText(translation, {
          font: LATIN_FONT,
          size: Math.max(30, Math.round(arSize * 0.46)),
          color: "#E2E8F0",
          spacing: 6,
        })
      : null;

    const contentH = ar.height + (tr ? GAP + tr.height : 0);
    const panelH = contentH + PAD_Y * 2;
    if (panelH > MAX_PANEL_H && i < sizes.length - 1) continue;

    const panelW = Math.min(
      OVERLAY_W - 60,
      Math.max(ar.width, tr?.width ?? 0) + PAD_X * 2,
    );
    const left = Math.round((OVERLAY_W - panelW) / 2);
    const top = Math.round(OVERLAY_H - BOTTOM_MARGIN - panelH);
    const panel = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${panelW}" height="${panelH}">` +
        `<rect width="${panelW}" height="${panelH}" rx="28" fill="#000000" fill-opacity="0.58"/></svg>`,
    );

    const layers: sharp.OverlayOptions[] = [
      { input: panel, left, top },
      {
        input: ar.buffer,
        left: Math.round((OVERLAY_W - ar.width) / 2),
        top: top + PAD_Y,
      },
    ];
    if (tr) {
      layers.push({
        input: tr.buffer,
        left: Math.round((OVERLAY_W - tr.width) / 2),
        top: top + PAD_Y + ar.height + GAP,
      });
    }

    await sharp({
      create: {
        width: OVERLAY_W,
        height: OVERLAY_H,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(layers)
      .png({ compressionLevel: 9 })
      .toFile(outFile);
    return;
  }
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
) {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) await fn(items[next++]);
    },
  );
  await Promise.all(workers);
}

/** Generates a PNG per segment, links the file in Postgres, advances project status. */
export async function generateOverlays(projectId: string) {
  const segments = await prisma.segment.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });
  if (segments.length === 0) throw new HttpError(409, "Upload a CSV first");

  await ensureDir(overlayDir(projectId));
  const concurrency = Number(process.env.OVERLAY_CONCURRENCY ?? 4);
  const results: { id: string; rel: string }[] = [];

  await mapLimit(segments, concurrency, async (seg) => {
    const rel = `${projectRel(projectId)}/overlays/${seg.id}.png`;
    await renderOverlayCard(seg.arabic, seg.translation, abs(rel));
    results.push({ id: seg.id, rel });
  });

  const now = new Date();
  const hasVideo =
    (await prisma.videoAsset.count({ where: { projectId } })) > 0;
  await prisma.$transaction([
    ...results.map((r) =>
      prisma.segment.update({
        where: { id: r.id },
        data: { overlayPath: r.rel, overlayGeneratedAt: now },
      }),
    ),
    prisma.project.update({
      where: { id: projectId },
      data: { status: hasVideo ? "VIDEO_READY" : "OVERLAYS_READY" },
    }),
  ]);
  return results.length;
}

export const overlayFile = (rel: string) => path.normalize(abs(rel));

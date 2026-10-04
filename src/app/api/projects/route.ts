import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/http";
import type { ProjectSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const rows = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { segments: true } } },
  });
  const data: ProjectSummary[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    segmentCount: p._count.segments,
  }));
  return Response.json(data);
});

const createSchema = z.object({ name: z.string().trim().min(1).max(120) });

export const POST = handle(async (req) => {
  const { name } = createSchema.parse(await req.json());
  const project = await prisma.project.create({ data: { name } });
  return Response.json({ id: project.id }, { status: 201 });
});

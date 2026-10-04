"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Film, Loader2, Trash2 } from "lucide-react";
import { api, errorLines, jsonBody } from "@/lib/api-client";
import type { ProjectSummary } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ProjectsHome() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<ProjectSummary[]>("/api/projects")
      .then(setProjects)
      .catch((e) => setError(errorLines(e)[0]));
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/projects", jsonBody("POST", { name }));
      router.push(`/projects/${id}`);
    } catch (err) {
      setError(errorLines(err)[0]);
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this project and all of its files?")) return;
    await api(`/api/projects/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Film className="h-7 w-7 text-primary" /> Quran Video Studio
        </h1>
        <p className="text-muted-foreground">Upload a segment CSV and a recitation video, preview the sync, export a finished MP4.</p>
      </header>

      {error && <Alert variant="destructive">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
          <CardDescription>Each project holds one CSV, one background video and its renders.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="flex gap-2">
            <Input placeholder="e.g. Surah Al-Fatiha – Mishary" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Projects</h2>
        {projects === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {projects?.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
        {projects?.map((p) => (
          <Card key={p.id} className="flex items-center justify-between p-4">
            <Link href={`/projects/${p.id}`} className="min-w-0 flex-1">
              <div className="truncate font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                {p.segmentCount} segments · {new Date(p.createdAt).toLocaleString()}
              </div>
            </Link>
            <Badge variant="secondary" className="mx-3">{p.status.replace("_", " ")}</Badge>
            <Button variant="ghost" size="icon" onClick={() => remove(p.id)} aria-label="Delete project">
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </section>
    </main>
  );
}

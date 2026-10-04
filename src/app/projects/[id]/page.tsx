import { ProjectWorkspace } from "@/components/project-workspace";

export default function Page({ params }: { params: { id: string } }) {
  return <ProjectWorkspace id={params.id} />;
}

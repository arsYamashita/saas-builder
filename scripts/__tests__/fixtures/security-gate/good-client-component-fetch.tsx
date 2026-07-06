"use client";

import { useEffect, useState } from "react";

export function ProjectStatusBadge({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      // Client Component parsing its own fetch response — out of scope for
      // this gate (see isClientComponent doc comment in security-gate-core.ts).
      .catch(() => ({}))
      .then((data) => setStatus(data?.status ?? null));
  }, [projectId]);

  return <span>{status ?? "..."}</span>;
}

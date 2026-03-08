"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ContentForm } from "@/components/domain/content-form";

export default function EditContentPage() {
  const router = useRouter();
  const params = useParams<{ contentId: string }>();
  const [initialValues, setInitialValues] = useState<any>(null);

  useEffect(() => {
    const run = async () => {
      const res = await fetch(`/api/domain/content/${params.contentId}`);
      const json = await res.json();
      setInitialValues({
        title: json.content.title,
        body: json.content.body ?? "",
        content_type: json.content.content_type,
        visibility: json.content.visibility,
        published: json.content.published,
      });
    };

    run();
  }, [params.contentId]);

  if (!initialValues) {
    return <main className="p-6">Loading...</main>;
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Edit Content</h1>

      <ContentForm
        initialValues={initialValues}
        submitLabel="更新する"
        onSubmit={async (values) => {
          const res = await fetch(
            `/api/domain/content/${params.contentId}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(values),
            }
          );

          if (!res.ok) {
            const json = await res.json();
            alert(json.error || "更新に失敗しました");
            return;
          }

          router.push("/content");
          router.refresh();
        }}
      />
    </main>
  );
}

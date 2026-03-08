"use client";

import { useState } from "react";

type ContentFormValues = {
  title: string;
  body: string;
  content_type: string;
  visibility: string;
  published: boolean;
};

type Props = {
  initialValues?: ContentFormValues;
  submitLabel?: string;
  onSubmit: (values: ContentFormValues) => Promise<void>;
};

const defaultValues: ContentFormValues = {
  title: "",
  body: "",
  content_type: "article",
  visibility: "members",
  published: false,
};

export function ContentForm({
  initialValues,
  submitLabel = "保存",
  onSubmit,
}: Props) {
  const [values, setValues] = useState<ContentFormValues>(
    initialValues ?? defaultValues
  );
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          await onSubmit(values);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <label className="block mb-1 text-sm font-medium">タイトル</label>
        <input
          className="w-full border rounded px-3 py-2"
          value={values.title}
          onChange={(e) => setValues({ ...values, title: e.target.value })}
        />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium">本文</label>
        <textarea
          className="w-full border rounded px-3 py-2 min-h-40"
          value={values.body}
          onChange={(e) => setValues({ ...values, body: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium">コンテンツ種別</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={values.content_type}
            onChange={(e) =>
              setValues({ ...values, content_type: e.target.value })
            }
          >
            <option value="article">article</option>
            <option value="video">video</option>
            <option value="audio">audio</option>
          </select>
        </div>

        <div>
          <label className="block mb-1 text-sm font-medium">公開範囲</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={values.visibility}
            onChange={(e) =>
              setValues({ ...values, visibility: e.target.value })
            }
          >
            <option value="members">members</option>
            <option value="public">public</option>
            <option value="private">private</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={values.published}
          onChange={(e) =>
            setValues({ ...values, published: e.target.checked })
          }
        />
        公開済みにする
      </label>

      <button
        disabled={loading}
        className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
      >
        {loading ? "保存中..." : submitLabel}
      </button>
    </form>
  );
}

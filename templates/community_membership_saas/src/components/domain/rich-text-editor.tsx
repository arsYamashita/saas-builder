"use client";

import { useState, useCallback, useRef } from "react";
import type { RichTextBody } from "@/types/database";

interface RichTextEditorProps {
  initialValue?: string;
  placeholder?: string;
  onChange: (body: RichTextBody, plainText: string) => void;
  maxLength?: number;
  minHeight?: string;
}

function ToolbarButton({
  label,
  icon,
  onClick,
  active,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`
        p-1.5 rounded text-sm font-mono transition-colors duration-150
        ${
          active
            ? "bg-gray-200 text-gray-900"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        }
      `}
    >
      {icon}
    </button>
  );
}

/**
 * Convert plain text to a ProseMirror-compatible JSON document.
 * Each non-empty line becomes a paragraph node.
 */
function textToProseMirrorJson(text: string): RichTextBody {
  const lines = text.split("\n");
  const content = lines.map((line) => {
    if (line.trim() === "") {
      return { type: "paragraph" as const };
    }
    return {
      type: "paragraph" as const,
      content: [{ type: "text" as const, text: line }],
    };
  });

  return {
    type: "doc",
    content,
  };
}

/**
 * Extract plain text from a ProseMirror-compatible JSON document.
 */
export function proseMirrorToPlainText(body: RichTextBody | null | undefined): string {
  if (!body) return "";

  // If it is a simple string (fallback)
  if (typeof body === "string") return body;

  const content = body.content as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(content)) return "";

  return content
    .map((node) => {
      const children = node.content as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(children)) return "";
      return children
        .map((child) => (typeof child.text === "string" ? child.text : ""))
        .join("");
    })
    .join("\n");
}

export function RichTextEditor({
  initialValue = "",
  placeholder = "ここに本文を書きましょう...",
  onChange,
  maxLength = 10000,
  minHeight = "12rem",
}: RichTextEditorProps) {
  const [text, setText] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = text.length;
  const isOverLimit = charCount > maxLength;

  const handleChange = useCallback(
    (value: string) => {
      setText(value);
      onChange(textToProseMirrorJson(value), value);
    },
    [onChange]
  );

  const wrapSelection = useCallback(
    (before: string, after: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = text.substring(start, end);
      const newText =
        text.substring(0, start) + before + selected + after + text.substring(end);

      handleChange(newText);

      // Restore cursor position after wrapping
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + before.length,
          end + before.length
        );
      });
    },
    [text, handleChange]
  );

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
      {/* Toolbar */}
      <div
        className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200"
        role="toolbar"
        aria-label="テキスト書式ツールバー"
      >
        <ToolbarButton
          label="太字"
          icon="B"
          onClick={() => wrapSelection("**", "**")}
        />
        <ToolbarButton
          label="斜体"
          icon="I"
          onClick={() => wrapSelection("*", "*")}
        />
        <ToolbarButton
          label="リンク"
          icon="🔗"
          onClick={() => wrapSelection("[", "](url)")}
        />
        <ToolbarButton
          label="コードブロック"
          icon="<>"
          onClick={() => wrapSelection("```\n", "\n```")}
        />
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        aria-label="投稿本文"
        className={`
          w-full px-4 py-3 resize-y text-gray-900 placeholder-gray-400
          focus:outline-none text-sm leading-relaxed
          ${isOverLimit ? "text-red-600" : ""}
        `}
        style={{ minHeight }}
      />

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-400">
          Shift+Enter で改行、Enter で送信
        </p>
        <p
          className={`text-xs tabular-nums ${
            isOverLimit ? "text-red-500 font-medium" : "text-gray-400"
          }`}
        >
          {charCount.toLocaleString()} / {maxLength.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

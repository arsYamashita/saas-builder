"use client";

import type { Category } from "@/types/database";

interface CategoryWithCount extends Category {
  post_count?: number;
}

interface CategorySidebarProps {
  categories: CategoryWithCount[];
  activeCategoryId: string | null;
  totalPostCount: number;
  onCategoryChange: (categoryId: string | null) => void;
}

export function CategorySidebar({
  categories,
  activeCategoryId,
  totalPostCount,
  onCategoryChange,
}: CategorySidebarProps) {
  return (
    <nav
      aria-label="カテゴリフィルター"
      className="w-full"
    >
      {/* Desktop: vertical list / Mobile: horizontal scroll */}
      <div className="lg:space-y-1 flex lg:flex-col overflow-x-auto lg:overflow-x-visible gap-1 lg:gap-0 pb-2 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0 scrollbar-hide">
        {/* All categories */}
        <button
          type="button"
          onClick={() => onCategoryChange(null)}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
            whitespace-nowrap transition-colors duration-150
            flex-shrink-0 lg:flex-shrink lg:w-full
            ${
              activeCategoryId === null
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }
          `}
          aria-current={activeCategoryId === null ? "true" : undefined}
          aria-label="すべてのカテゴリを表示"
        >
          <span className="text-base" aria-hidden="true">
            📋
          </span>
          <span className="flex-1 text-left">すべて</span>
          <span
            className={`
              text-xs tabular-nums px-1.5 py-0.5 rounded-full
              ${
                activeCategoryId === null
                  ? "bg-blue-100 text-blue-600"
                  : "bg-gray-100 text-gray-500"
              }
            `}
          >
            {totalPostCount}
          </span>
        </button>

        {/* Category items */}
        {categories.map((category) => {
          const isActive = activeCategoryId === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onCategoryChange(category.id)}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                whitespace-nowrap transition-colors duration-150
                flex-shrink-0 lg:flex-shrink lg:w-full
                ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }
              `}
              aria-current={isActive ? "true" : undefined}
              aria-label={`${category.name}の投稿を表示`}
            >
              {category.emoji && (
                <span className="text-base" aria-hidden="true">
                  {category.emoji}
                </span>
              )}
              <span className="flex-1 text-left">{category.name}</span>
              {category.post_count !== undefined && (
                <span
                  className={`
                    text-xs tabular-nums px-1.5 py-0.5 rounded-full
                    ${
                      isActive
                        ? "bg-blue-100 text-blue-600"
                        : "bg-gray-100 text-gray-500"
                    }
                  `}
                >
                  {category.post_count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hint text - desktop only */}
      <p className="hidden lg:block mt-6 text-xs text-gray-400 leading-relaxed px-3">
        カテゴリでフィルタリングして、興味のある話題を見つけましょう
      </p>
    </nav>
  );
}

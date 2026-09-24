import React from 'react';

/** Shaped like TemplateCard, so the grid does not jump when data lands. */
export function TemplateCardSkeleton() {
  return (
    <div className="ui-card overflow-hidden">
      <div className="ui-skeleton aspect-[16/10] !rounded-none" />
      <div className="space-y-3 p-4">
        <div className="ui-skeleton h-4 w-3/5" />
        <div className="ui-skeleton h-3 w-full" />
        <div className="ui-skeleton h-3 w-4/5" />
        <div className="flex gap-1.5 pt-1">
          <div className="ui-skeleton h-5 w-16" />
          <div className="ui-skeleton h-5 w-20" />
          <div className="ui-skeleton h-5 w-14" />
        </div>
        <div className="flex items-center justify-between border-t border-ink-100 pt-3.5">
          <div className="ui-skeleton h-3 w-24" />
          <div className="flex gap-2">
            <div className="ui-skeleton h-7 w-16 rounded-lg" />
            <div className="ui-skeleton h-7 w-20 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TemplateGridSkeleton({ count = 8 }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <TemplateCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="ui-card space-y-3 p-5">
      <div className="ui-skeleton h-3 w-24" />
      <div className="ui-skeleton h-7 w-16" />
    </div>
  );
}

export function RowSkeleton({ rows = 4 }) {
  return (
    <div className="ui-card divide-y divide-ink-100 overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <div className="ui-skeleton h-14 w-20 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="ui-skeleton h-4 w-2/5" />
            <div className="ui-skeleton h-3 w-3/5" />
          </div>
          <div className="ui-skeleton hidden h-7 w-24 rounded-lg sm:block" />
        </div>
      ))}
    </div>
  );
}

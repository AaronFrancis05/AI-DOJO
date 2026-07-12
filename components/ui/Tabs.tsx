/* ───────────────────────────────────────────────
   Tabs — underline-active-state horizontal tab set
   Used by Session Review, Progress, Leaderboard, Avatar Settings
   ─────────────────────────────────────────────── */

'use client';

import { cn } from '@/lib/design-tokens';
import { useState } from 'react';

export interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
  /** Render the active tab panel content */
  renderPanel?: (tabId: string) => React.ReactNode;
  /** Or use children with controlled activeTab */
  children?: React.ReactNode;
}

export function Tabs({ tabs, defaultTab, onChange, className, renderPanel, children }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id ?? '');

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  return (
    <div className={cn('w-full', className)}>
      <div className="flex border-b border-dojo-border" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              'px-4 py-3 text-sm font-medium transition-colors relative',
              activeTab === tab.id
                ? 'text-dojo-text-primary'
                : 'text-dojo-text-muted hover:text-dojo-text-primary',
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-dojo-accent" />
            )}
          </button>
        ))}
      </div>
      <div className="pt-4" role="tabpanel">
        {renderPanel ? renderPanel(activeTab) : children}
      </div>
    </div>
  );
}

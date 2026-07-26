'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const PageTitleContext = createContext<{ title: string; setTitle: (t: string) => void } | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState('AI DOJO');
  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle(title: string) {
  const ctx = useContext(PageTitleContext);
  useEffect(() => {
    if (ctx) ctx.setTitle(title);
  }, [ctx, title]);
}

export function usePageTitleValue(): string {
  const ctx = useContext(PageTitleContext);
  return ctx?.title ?? 'AI DOJO';
}

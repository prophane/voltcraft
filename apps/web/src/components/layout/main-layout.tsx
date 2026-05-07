import type { ReactNode } from 'react'
import { Sidebar } from './sidebar'
import { MobileBottomNav } from './mobile-bottom-nav'

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-bg-base relative overflow-x-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[32rem] w-[32rem] rounded-full opacity-20 blur-3xl" style={{ background: 'radial-gradient(circle, rgba(232,17,45,0.35) 0%, rgba(232,17,45,0.05) 45%, transparent 70%)' }} />
      <div className="pointer-events-none absolute top-24 -left-40 h-80 w-80 rounded-full opacity-20 blur-3xl" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 65%)' }} />
      <Sidebar />
      <main className="relative lg:ml-64 min-h-screen pb-20 lg:pb-0">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-8">
          {children}
        </div>
      </main>
      <MobileBottomNav />
    </div>
  )
}

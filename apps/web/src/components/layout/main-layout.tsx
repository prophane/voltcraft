import type { ReactNode } from 'react'
import { Sidebar } from './sidebar'
import { MobileBottomNav } from './mobile-bottom-nav'

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-bg-base">
      <Sidebar />
      <main className="lg:ml-64 min-h-screen pb-20 lg:pb-0">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-8">
          {children}
        </div>
      </main>
      <MobileBottomNav />
    </div>
  )
}

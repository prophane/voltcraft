import { useEffect } from 'react'
import { AppRouter } from './router'
import { useAuthStore } from '@/features/auth/store'
import { api } from '@/lib/api-client'

export function App() {
  const setUser = useAuthStore((s) => s.setUser)

  useEffect(() => {
    api.get<{ user: { id: string; email: string; name: string } }>('/auth/session')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
  }, [setUser])

  return <AppRouter />
}

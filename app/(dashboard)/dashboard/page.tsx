'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useState, useEffect } from 'react'
import { BalanceCard } from '@/components/dashboard/balance-card'
import { QuickActions } from '@/components/dashboard/quick-actions'

export default function DashboardPage() {
  const { getAccessToken } = usePrivy()
  const [balance, setBalance] = useState(null)
  const [profile, setProfile] = useState<{ name?: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const token = await getAccessToken()
        const headers = { Authorization: `Bearer ${token}` }
        
        // Sync wallet first (ensures wallet is stored in DB)
        await fetch('/api/user/sync-wallet', { method: 'POST', headers })
        
        // Then fetch balance and profile
        const [balanceRes, profileRes] = await Promise.all([
          fetch('/api/user/balance', { headers }),
          fetch('/api/user/profile', { headers }),
        ])
        if (balanceRes.ok) setBalance(await balanceRes.json())
        if (profileRes.ok) setProfile(await profileRes.json())
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [getAccessToken])

  const greeting = profile?.name ? `Hey, ${profile.name}! 👋` : 'Welcome back! 👋'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-brand-gray mb-1">Dashboard</p>
        <h1 className="text-3xl font-bold text-brand-black">{greeting}</h1>
      </div>

      <BalanceCard balance={balance} isLoading={isLoading} />
      <QuickActions />

      <div className="bg-white rounded-2xl border border-brand-border p-6">
        <h3 className="text-lg font-semibold text-brand-black mb-4">Recent Activity</h3>
        <p className="text-brand-gray text-center py-8">
          No transactions yet. Create your first invoice to get started!
        </p>
      </div>
    </div>
  )
}

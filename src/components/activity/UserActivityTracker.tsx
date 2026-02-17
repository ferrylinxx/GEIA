'use client'

import { useUserActivity } from '@/hooks/use-user-activity'

export default function UserActivityTracker() {
  useUserActivity()
  return null
}

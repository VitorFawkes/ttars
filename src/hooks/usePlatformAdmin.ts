import { useAuth } from '../contexts/AuthContext'

export function usePlatformAdmin(): boolean {
  const { profile } = useAuth()
  // is_platform_admin é coluna nova (migration 20260412_platform_admin_01).
  // database.types.ts será regenerado após promover para prod; até lá, cast.
  return (profile as unknown as { is_platform_admin?: boolean })?.is_platform_admin === true
}

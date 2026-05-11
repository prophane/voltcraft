import { cn } from '@/lib/utils'

type VoltcraftLogoProps = {
  size?: number
  showWordmark?: boolean
  className?: string
}

function LogoMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Voltcraft logo"
      focusable="false"
    >
      <title>Voltcraft logo</title>

      <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path
        d="M32 6A26 26 0 0 1 55 20"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M9 24A26 26 0 0 0 21 54"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M18 21L32 46L46 21"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="49" cy="18" r="2" fill="currentColor" opacity="0.8" />
      <circle cx="15" cy="46" r="2" fill="currentColor" opacity="0.8" />
    </svg>
  )
}

export function VoltcraftMiniIcon({ size = 32, className }: Omit<VoltcraftLogoProps, 'showWordmark'>) {
  return (
    <span className={cn('inline-flex items-center justify-center', className)} aria-label="Voltcraft icon">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Voltcraft mini icon"
        focusable="false"
      >
        <title>Voltcraft mini icon</title>
        <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2" opacity="0.28" />
        <path
          d="M10 11L16 22L22 11"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export default function VoltcraftLogo({ size = 32, showWordmark = false, className }: VoltcraftLogoProps) {
  if (!showWordmark) {
    return (
      <span className={cn('inline-flex items-center justify-center', className)} aria-label="Voltcraft">
        <LogoMark size={size} />
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} aria-label="Voltcraft">
      <LogoMark size={size} />
      <span className="text-lg font-semibold tracking-tight">Voltcraft</span>
    </span>
  )
}

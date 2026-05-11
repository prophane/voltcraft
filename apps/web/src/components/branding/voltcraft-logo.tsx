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
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Voltcraft logo"
      focusable="false"
    >
      <defs>
        <style>{`
          @keyframes energyPulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
          }
          .energy-dot { animation: energyPulse 2.4s ease-in-out infinite; }
        `}</style>
        <linearGradient id="voltGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      
      <title>Voltcraft logo</title>

      {/* Outer ring - circuit boundary */}
      <circle cx="40" cy="40" r="35" stroke="currentColor" strokeWidth="1.5" opacity="0.15" />
      
      {/* Energy flow arc - top right */}
      <path
        d="M 40 10 A 30 30 0 0 1 65 25"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
      
      {/* Energy flow arc - bottom left */}
      <path
        d="M 15 55 A 30 30 0 0 1 40 70"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* Core V - premium stylized form */}
      <path
        d="M 25 32 Q 40 55 55 32"
        stroke="currentColor"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Energy nodes with pulsing effect */}
      <circle cx="65" cy="20" r="2.2" fill="currentColor" className="energy-dot" />
      <circle cx="15" cy="60" r="2.2" fill="currentColor" className="energy-dot" />
      
      {/* Center point - energy source */}
      <circle cx="40" cy="40" r="1.8" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

export function VoltcraftMiniIcon({ size = 32, className }: Omit<VoltcraftLogoProps, 'showWordmark'>) {
  return (
    <span className={cn('inline-flex items-center justify-center', className)} aria-label="Voltcraft icon">
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Voltcraft mini icon"
        focusable="false"
      >
        <defs>
          <style>{`
            @keyframes miniPulse {
              0%, 100% { opacity: 0.5; }
              50% { opacity: 1; }
            }
            .mini-pulse { animation: miniPulse 2s ease-in-out infinite; }
          `}</style>
        </defs>
        <title>Voltcraft mini icon</title>
        
        {/* Outer circle */}
        <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="1.2" opacity="0.2" />
        
        {/* Core V */}
        <path
          d="M 12 15 Q 20 28 28 15"
          stroke="currentColor"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Energy pulsers */}
        <circle cx="28" cy="12" r="1.5" fill="currentColor" className="mini-pulse" />
        <circle cx="12" cy="28" r="1.5" fill="currentColor" className="mini-pulse" />
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

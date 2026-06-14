import './SanayaAvatar.css';

interface SanayaAvatarProps {
  size?: number;
  /** Adds a gentle "speaking" animation when true. */
  speaking?: boolean;
}

/**
 * Sanaya — an animated female avatar SVG for the Amazon Now assistant.
 * Pure SVG + CSS: blinking eyes, gentle head bob, and a speaking mouth motion.
 */
export function SanayaAvatar({ size = 48, speaking = false }: SanayaAvatarProps) {
  return (
    <span
      className={`sanaya ${speaking ? 'sanaya--speaking' : ''}`}
      style={{ width: size, height: size }}
      aria-label="Sanaya, your Amazon Now assistant"
      role="img"
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="sanaya__svg">
        <defs>
          <linearGradient id="sanayaBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
          <linearGradient id="sanayaHair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b2417" />
            <stop offset="100%" stopColor="#1f140c" />
          </linearGradient>
        </defs>

        {/* Background circle */}
        <circle cx="50" cy="50" r="48" fill="url(#sanayaBg)" />

        {/* Head bob group */}
        <g className="sanaya__bob">
          {/* Back hair */}
          <path d="M24 52 Q22 22 50 20 Q78 22 76 52 Q78 70 70 78 L30 78 Q22 70 24 52Z" fill="url(#sanayaHair)" />

          {/* Neck */}
          <rect x="44" y="62" width="12" height="14" rx="6" fill="#f1c9a5" />

          {/* Face */}
          <ellipse cx="50" cy="50" rx="20" ry="22" fill="#f6d3b3" />

          {/* Front hair / fringe */}
          <path d="M30 42 Q30 24 50 24 Q70 24 70 42 Q62 34 50 35 Q38 34 30 42Z" fill="url(#sanayaHair)" />
          {/* Side hair strands */}
          <path d="M30 42 Q26 58 30 70 L34 70 Q31 56 34 44Z" fill="url(#sanayaHair)" />
          <path d="M70 42 Q74 58 70 70 L66 70 Q69 56 66 44Z" fill="url(#sanayaHair)" />

          {/* Eyebrows */}
          <path d="M38 44 Q42 42 46 44" stroke="#5b3a2a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M54 44 Q58 42 62 44" stroke="#5b3a2a" strokeWidth="1.4" fill="none" strokeLinecap="round" />

          {/* Eyes (blink) */}
          <g className="sanaya__eyes">
            <ellipse cx="42" cy="50" rx="3.2" ry="3.8" fill="#fff" />
            <circle cx="42" cy="50.5" r="2" fill="#2b1a12" />
            <ellipse cx="58" cy="50" rx="3.2" ry="3.8" fill="#fff" />
            <circle cx="58" cy="50.5" r="2" fill="#2b1a12" />
          </g>

          {/* Cheeks */}
          <circle cx="38" cy="58" r="2.6" fill="#f3a9a0" opacity="0.55" />
          <circle cx="62" cy="58" r="2.6" fill="#f3a9a0" opacity="0.55" />

          {/* Nose */}
          <path d="M50 53 Q49 56 51 57" stroke="#d9a376" strokeWidth="1.1" fill="none" strokeLinecap="round" />

          {/* Mouth (animates when speaking) */}
          <path className="sanaya__mouth" d="M45 61 Q50 65 55 61" stroke="#b5483f" strokeWidth="1.8" fill="#e07b73" strokeLinecap="round" />

          {/* Bindi */}
          <circle cx="50" cy="40" r="1.4" fill="#dc2626" />
        </g>
      </svg>
    </span>
  );
}

export default SanayaAvatar;

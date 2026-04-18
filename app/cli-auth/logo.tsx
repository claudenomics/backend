interface ClaudenomicsLogoProps {
  size?: number
  className?: string
}

export function ClaudenomicsLogo({ size = 24, className = '' }: ClaudenomicsLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={15}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="92.5" transform="matrix(-1 0 0 1 200 0)" />
      <line y1="-7.5" x2="190.158" y2="-7.5" transform="matrix(-1 0 0 1 195 107)" />
      <line x1="173.825" y1="159.321" x2="12.6494" y2="100.658" />
      <line x1="175.026" y1="39.5204" x2="12.6801" y2="98.6095" />
    </svg>
  )
}

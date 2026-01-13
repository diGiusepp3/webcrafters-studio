export const WebcraftersLogo = ({ size = 40 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Webcrafters Studio AI"
    >
        {/* Outer frame */}
        <rect
            x="6"
            y="6"
            width="52"
            height="52"
            rx="12"
            fill="url(#bg)"
        />

        {/* Layered blocks (studio / craft) */}
        <rect x="18" y="18" width="28" height="6" rx="3" fill="white" />
        <rect x="18" y="29" width="20" height="6" rx="3" fill="white" opacity="0.9" />
        <rect x="18" y="40" width="14" height="6" rx="3" fill="white" opacity="0.75" />

        <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
        </defs>
    </svg>
);

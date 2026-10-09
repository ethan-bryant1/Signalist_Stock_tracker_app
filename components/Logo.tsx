import { cn } from "@/lib/utils";

// The Loops logo, drawn through a mask so it takes the theme's text color
// (black in light mode, white in dark mode)
const LOGO_MASK = "url(/assets/icons/loops-logo.png) center / contain no-repeat";

const Logo = ({ className }: { className?: string }) => (
    <span
        role="img"
        aria-label="Loops Watch"
        className={cn("block h-14 aspect-[637/414] bg-gray-100", className)}
        style={{ mask: LOGO_MASK, WebkitMask: LOGO_MASK }}
    />
);

export default Logo;

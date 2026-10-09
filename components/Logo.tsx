import Image from "next/image";

// The chart icon plus the app name, drawn as text so it follows the theme's text color
const Logo = () => (
    <span className="flex items-center gap-2">
        <Image src="/assets/icons/logo-icon.svg" alt="" width={28} height={30} className="h-8 w-auto" />
        <span className="whitespace-nowrap text-2xl font-bold tracking-tight text-gray-100">Loops Watch</span>
    </span>
);

export default Logo;

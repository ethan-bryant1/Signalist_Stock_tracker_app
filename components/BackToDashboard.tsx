import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const BackToDashboard = () => (
    <Link href="/" className="flex w-fit items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-100 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Dashboard
    </Link>
);

export default BackToDashboard;

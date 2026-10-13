"use client";

import { useRouter } from "next/navigation";
import { ToolButton } from "@/components/ToolButton";

// Asks the server for the page again without a full reload
const RetryButton = () => {
    const router = useRouter();
    return (
        <ToolButton onClick={() => router.refresh()} title="Load the page again">
            Try again
        </ToolButton>
    );
};

export default RetryButton;

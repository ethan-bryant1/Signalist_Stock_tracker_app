import BackToDashboard from "@/components/BackToDashboard";

// The top of every section page: the way back to the dashboard, the page's title and what it shows
const PageHeader = ({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) => (
    <div className="flex flex-col gap-4">
        <BackToDashboard />
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-gray-100 sm:text-3xl">{title}</h1>
                {description && <p className="mt-1 max-w-3xl text-sm text-gray-500">{description}</p>}
            </div>
            {children}
        </div>
    </div>
);

export default PageHeader;

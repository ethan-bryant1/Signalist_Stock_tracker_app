'use client';

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Settings2 } from "lucide-react";
import { useHeatmapSettings } from "@/hooks/useHeatmapSettings";
import { cn } from "@/lib/utils";

// The settings that change how the map looks for this viewer (not what it shows), remembered in this browser
const HeatmapDisplaySettings = ({ container }: { container?: React.RefObject<HTMLElement | null> }) => {
    const [settings, update] = useHeatmapSettings();
    const choice = (active: boolean) =>
        cn(
            "h-7 flex-1 cursor-pointer rounded-md px-2 text-xs font-semibold transition-colors",
            active ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-700 hover:text-gray-100"
        );
    return (
        <PopoverPrimitive.Root>
            <PopoverPrimitive.Trigger
                title="Display settings"
                className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-gray-600 px-3 text-xs font-semibold text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-100 data-[popup-open]:border-gray-100 data-[popup-open]:text-gray-100"
            >
                <Settings2 className="h-3.5 w-3.5" />
                Display
            </PopoverPrimitive.Trigger>
            {/* "contents" keeps the portal's wrapper out of the page grid it's placed in */}
            <PopoverPrimitive.Portal container={container} className="contents">
                <PopoverPrimitive.Positioner side="bottom" align="end" sideOffset={6} className="z-[70]">
                    <PopoverPrimitive.Popup className="w-72 rounded-lg border border-gray-600 bg-gray-900 p-3 text-xs text-gray-400 shadow-2xl shadow-black/40 outline-none">
                        <PopoverPrimitive.Title className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Display</PopoverPrimitive.Title>
                        <p className="mt-3 font-medium text-gray-100">Colors</p>
                        <div role="group" aria-label="Colors" className="mt-1.5 flex gap-0.5 rounded-lg border border-gray-600 bg-gray-800 p-0.5">
                            <button type="button" aria-pressed={settings.palette === "classic"} onClick={() => update({ palette: "classic" })} className={choice(settings.palette === "classic")}>
                                Green / red
                            </button>
                            <button type="button" aria-pressed={settings.palette === "cvd"} onClick={() => update({ palette: "cvd" })} className={choice(settings.palette === "cvd")}>
                                Blue / orange
                            </button>
                        </div>
                        <p className="mt-1.5 text-[11px] text-gray-500">Blue and orange stay distinct for red-green color blindness. The scale is the same.</p>
                        <p className="mt-3 font-medium text-gray-100">Logos on large tiles</p>
                        <div role="group" aria-label="Logos on large tiles" className="mt-1.5 flex gap-0.5 rounded-lg border border-gray-600 bg-gray-800 p-0.5">
                            <button type="button" aria-pressed={settings.logos} onClick={() => update({ logos: true })} className={choice(settings.logos)}>
                                Show
                            </button>
                            <button type="button" aria-pressed={!settings.logos} onClick={() => update({ logos: false })} className={choice(!settings.logos)}>
                                Hide
                            </button>
                        </div>
                        <p className="mt-3 border-t border-gray-600 pt-2 text-[11px] text-gray-500">Remembered in this browser. Tickers and changes always show where they fit in full.</p>
                    </PopoverPrimitive.Popup>
                </PopoverPrimitive.Positioner>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
};

export default HeatmapDisplaySettings;

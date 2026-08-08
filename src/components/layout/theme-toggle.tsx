import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "./theme-provider";

/**
 * Theme toggle — single icon button that flips between light and dark.
 * Click cycles light ↔ dark; the icon swaps automatically.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        >
          <Sun
            className={`h-4 w-4 transition-all ${
              isDark ? "rotate-90 scale-0" : "rotate-0 scale-100"
            }`}
          />
          <Moon
            className={`absolute h-4 w-4 transition-all ${
              isDark ? "rotate-0 scale-100" : "-rotate-90 scale-0"
            }`}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {isDark ? "Light mode" : "Dark mode"}
      </TooltipContent>
    </Tooltip>
  );
}

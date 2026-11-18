import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useActiveOrganizationId } from "@/features/access/use-docme-role";
import { useMyOrganizations, useSwitchOrganization } from "./hooks";

/**
 * Organization group at the top of the user menu (SPEC2 §4, H3). One item
 * per organization, the active one checked. Arrow keys + Enter work through
 * the Radix menu; focus returns to the trigger when it closes.
 */
export function OrgSwitcherMenuGroup() {
  const { data: orgs } = useMyOrganizations();
  const activeId = useActiveOrganizationId();
  const switchTo = useSwitchOrganization();

  if (!orgs || orgs.length === 0) return null;

  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Organization</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={activeId ?? ""}
        onValueChange={(id) => {
          if (id && id !== activeId) void switchTo(id);
        }}
      >
        {orgs.map((org) => (
          <DropdownMenuPrimitive.RadioItem
            key={org.itemId}
            value={org.itemId}
            className="relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground"
          >
            <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
              <DropdownMenuPrimitive.ItemIndicator>
                <Check className="h-4 w-4" />
              </DropdownMenuPrimitive.ItemIndicator>
            </span>
            <span className="truncate">{org.name}</span>
          </DropdownMenuPrimitive.RadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
    </>
  );
}

/** Active organization name for the topbar (hidden below `md`). */
export function ActiveOrganizationName() {
  const { data: orgs } = useMyOrganizations();
  const activeId = useActiveOrganizationId();
  const org = orgs?.find((o) => o.itemId === activeId);
  if (!org) return null;
  return (
    <div className="hidden items-center gap-1.5 border-r pr-3 text-sm md:flex">
      <span className="text-muted-foreground">Organization</span>
      <span className="max-w-[12rem] truncate font-medium">{org.name}</span>
    </div>
  );
}

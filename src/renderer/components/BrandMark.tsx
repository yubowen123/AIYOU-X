import { cn } from "../../shared/utils";
import logoUrl from "../../../build/icon.svg";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img className={cn("brand-mark", className)} src={logoUrl} alt="" aria-hidden="true" draggable={false} />
  );
}

import { ShieldCheck, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { detectLineKind, LINE_KIND_LABEL, LINE_KIND_TOOLTIP } from "@/lib/whatsappLines";

interface LineKindBadgeProps {
  phoneNumberId: string | null | undefined;
  className?: string;
}

export function LineKindBadge({ phoneNumberId, className }: LineKindBadgeProps) {
  const kind = detectLineKind(phoneNumberId);
  const isOficial = kind === "oficial_meta";
  const Icon = isOficial ? AlertTriangle : ShieldCheck;
  const color = isOficial
    ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
    : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${color} gap-1 ${className ?? ""}`}>
            <Icon className="h-3 w-3" />
            {LINE_KIND_LABEL[kind]}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{LINE_KIND_TOOLTIP[kind]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

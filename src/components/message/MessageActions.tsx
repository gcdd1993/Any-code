import React, { useState } from "react";
import { Copy, Check, RefreshCw, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { clipboardService } from "@/lib/clipboard";

interface MessageActionsProps {
  content: string;
  onRegenerate?: () => void;
  onEdit?: () => void;
  className?: string;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  content,
  onRegenerate,
  onEdit,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await clipboardService.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipProvider>
      <div className={cn(
        "flex items-center gap-1 bg-background/80 backdrop-blur-sm border border-border/50 rounded-md shadow-sm p-1 transition-all",
        className
      )}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleCopy}
              className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>复制内容</TooltipContent>
        </Tooltip>

        {onRegenerate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onRegenerate}
                className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>重新生成</TooltipContent>
          </Tooltip>
        )}

        {onEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onEdit}
                className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>编辑消息</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};

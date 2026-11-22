import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Machine } from "@/vm";
import { cn } from "cn";

export function ConsoleView({
  mv,
  onSubmit,
}: {
  mv: Machine;
  onSubmit: (text: string) => void;
}) {
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [mv.consoleLines, mv.input]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 px-3 py-2 font-mono text-[12px] leading-5">
          {mv.consoleLines.length === 0 ? (
            <p className="text-muted-foreground">
              Todavía no hubo salida. SYS 2 y SYS 4 escriben acá; SYS 1 y SYS 3 piden un dato.
            </p>
          ) : (
            mv.consoleLines.map((line, index) => (
              <p
                key={`${index}-${line.text}`}
                className={cn(
                  line.kind === "error" && "text-destructive",
                  line.kind === "info" && "text-muted-foreground",
                  line.kind === "in" && "text-primary",
                )}
              >
                {line.kind === "in" ? `‹ ${line.text}` : line.text || " "}
              </p>
            ))
          )}
          <div ref={end} />
        </div>
      </ScrollArea>
      {mv.input ? (
        <form
          className="flex gap-2 border-t p-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const text = String(data.get("dato") ?? "");
            onSubmit(text);
            event.currentTarget.reset();
          }}
        >
          <label className="sr-only" htmlFor="dato">
            {mv.input.prompt}
          </label>
          <Input
            id="dato"
            name="dato"
            autoFocus
            placeholder={mv.input.prompt}
            aria-label={mv.input.prompt}
            className="font-mono"
          />
          <Button type="submit">Enviar</Button>
        </form>
      ) : null}
    </div>
  );
}

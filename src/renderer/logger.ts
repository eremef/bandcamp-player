let isOverrideDone = false;

export function initRendererLogger(): void {
  if (isOverrideDone || typeof window === "undefined") return;

  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  function formatArgs(args: any[]): string {
    return args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(" ");
  }

  const levels: Array<"log" | "info" | "warn" | "error" | "debug"> = [
    "log",
    "info",
    "warn",
    "error",
    "debug",
  ];

  for (const level of levels) {
    console[level] = (...args: any[]) => {
      originalConsole[level](...args);

      try {
        const formatted = formatArgs(args);
        if (window.electron?.system?.writeLog) {
          window.electron.system.writeLog(level, formatted);
        }
      } catch {
        // Safe fallback
      }
    };
  }

  isOverrideDone = true;
}

initRendererLogger();

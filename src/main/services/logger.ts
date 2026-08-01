import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

const MAX_RETENTION_DAYS = 14;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export class LoggerService {
  private static instance: LoggerService;
  private logsDir: string = "";
  private isInitialized = false;

  private mainLogStream: fs.WriteStream | null = null;
  private rendererLogStream: fs.WriteStream | null = null;
  private currentMainDateStr = "";
  private currentRendererDateStr = "";

  private originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  private constructor() {}

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  public init(userDataPath?: string): void {
    if (this.isInitialized) return;

    try {
      const baseDir = userDataPath || (app ? app.getPath("userData") : process.cwd());
      this.logsDir = path.join(baseDir, "logs");

      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }

      this.cleanupOldLogs();
      this.overrideMainConsole();
      this.isInitialized = true;
    } catch (err) {
      this.originalConsole.error("[LoggerService] Failed to initialize logger:", err);
    }
  }

  public cleanupOldLogs(maxDays = MAX_RETENTION_DAYS): void {
    if (!this.logsDir || !fs.existsSync(this.logsDir)) return;

    const now = Date.now();
    const cutoffTime = now - maxDays * DAY_IN_MS;

    try {
      const files = fs.readdirSync(this.logsDir);
      for (const file of files) {
        if (file === "chromecast.log") {
          try {
            fs.unlinkSync(path.join(this.logsDir, file));
          } catch {
            // ignore
          }
          continue;
        }

        const dateMatch = file.match(/^(main|renderer)-(\d{4}-\d{2}-\d{2})\.log$/);
        if (dateMatch) {
          const fileDate = new Date(dateMatch[2]).getTime();
          if (!isNaN(fileDate) && fileDate < cutoffTime) {
            try {
              fs.unlinkSync(path.join(this.logsDir, file));
            } catch (err) {
              this.originalConsole.error(`[LoggerService] Failed to delete old log file ${file}:`, err);
            }
          }
        }
      }
    } catch (err) {
      this.originalConsole.error("[LoggerService] Cleanup error:", err);
    }
  }

  private getDateStr(date = new Date()): string {
    return date.toISOString().split("T")[0];
  }

  private writeToMain(line: string): void {
    const today = this.getDateStr();
    const filePath = path.join(this.logsDir, `main-${today}.log`);
    try {
      fs.appendFileSync(filePath, line, "utf8");
    } catch {
      // Ignore write errors
    }
  }

  private writeToRenderer(line: string): void {
    const today = this.getDateStr();
    const filePath = path.join(this.logsDir, `renderer-${today}.log`);
    try {
      fs.appendFileSync(filePath, line, "utf8");
    } catch {
      // Ignore write errors
    }
  }

  private formatArgs(args: any[]): string {
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

  private overrideMainConsole(): void {
    const levels: Array<"log" | "info" | "warn" | "error" | "debug"> = [
      "log",
      "info",
      "warn",
      "error",
      "debug",
    ];

    for (const level of levels) {
      console[level] = (...args: any[]) => {
        this.originalConsole[level](...args);

        try {
          const timestamp = new Date().toISOString();
          const formattedMessage = this.formatArgs(args);
          const line = `[${timestamp}] [${level.toUpperCase()}] ${formattedMessage}\n`;
          
          this.writeToMain(line);
        } catch {
          // Ignore error silently
        }
      };
    }
  }

  public writeRendererLog(level: string, message: string): void {
    if (!this.isInitialized) return;
    try {
      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
      this.writeToRenderer(line);
    } catch {
      // Ignore error silently
    }
  }
}

export const loggerService = LoggerService.getInstance();

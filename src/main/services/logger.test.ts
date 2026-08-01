import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { LoggerService } from "./logger";

describe("LoggerService", () => {
  let tempDir: string;
  let logger: LoggerService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "logger-test-"));
    logger = LoggerService.getInstance();
    // @ts-expect-error - re-initialize for testing in temp directory
    logger.isInitialized = false;
    // @ts-expect-error - reset logsDir for testing
    logger.logsDir = "";
    logger.init(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("should create logs directory and main log file on console.log", () => {
    console.log("Test main log message");

    const today = new Date().toISOString().split("T")[0];
    const logFilePath = path.join(tempDir, "logs", `main-${today}.log`);

    expect(fs.existsSync(logFilePath)).toBe(true);
    const content = fs.readFileSync(logFilePath, "utf8");
    expect(content).toContain("[LOG] Test main log message");
  });

  it("should write renderer log entries via writeRendererLog", () => {
    logger.writeRendererLog("info", "Frontend loaded successfully");

    const today = new Date().toISOString().split("T")[0];
    const logFilePath = path.join(tempDir, "logs", `renderer-${today}.log`);

    expect(fs.existsSync(logFilePath)).toBe(true);
    const content = fs.readFileSync(logFilePath, "utf8");
    expect(content).toContain("[INFO] Frontend loaded successfully");
  });

  it("should cleanup log files older than 14 days and obsolete chromecast.log", () => {
    const logsDir = path.join(tempDir, "logs");

    // Create mock old and new log files
    const oldDate = "2020-01-01";
    const recentDate = new Date().toISOString().split("T")[0];

    const oldMain = path.join(logsDir, `main-${oldDate}.log`);
    const recentMain = path.join(logsDir, `main-${recentDate}.log`);
    const chromecastLog = path.join(logsDir, "chromecast.log");

    fs.writeFileSync(oldMain, "old content");
    fs.writeFileSync(recentMain, "recent content");
    fs.writeFileSync(chromecastLog, "chromecast content");

    logger.cleanupOldLogs(14);

    expect(fs.existsSync(oldMain)).toBe(false);
    expect(fs.existsSync(chromecastLog)).toBe(false);
    expect(fs.existsSync(recentMain)).toBe(true);
  });
});

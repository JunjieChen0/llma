// src/chat/trace.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface TraceEntry {
  timestamp: number;
  type: 'tool_call' | 'tool_result' | 'reflection' | 'completion' | 'error' | 'info' | 'warning';
  message: string;
  details?: any;
  sessionId?: string;
  iteration?: number;
}

export interface TraceSession {
  id: string;
  startTime: number;
  endTime?: number;
  entries: TraceEntry[];
  userRequest: string;
  model?: string;
  config?: any;
  status: 'active' | 'completed' | 'failed' | 'aborted';
  toolCallCount: number;
  successCount: number;
  failureCount: number;
  reflections: number;
}

export class TraceManager {
  private static instance: TraceManager;
  private sessions: Map<string, TraceSession> = new Map();
  private traceDir: string;
  private maxSessions: number = 50;

  private constructor() {
    this.traceDir = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', '.llma_traces');
    this.ensureTraceDir();
  }

  static getInstance(): TraceManager {
    if (!TraceManager.instance) {
      TraceManager.instance = new TraceManager();
    }
    return TraceManager.instance;
  }

  private ensureTraceDir(): void {
    try {
      if (!fs.existsSync(this.traceDir)) {
        fs.mkdirSync(this.traceDir, { recursive: true });
      }
    } catch (error) {
      console.error('创建轨迹目录失败:', error);
    }
  }

  createSession(sessionId: string, userRequest: string, model?: string, config?: any): TraceSession {
    const session: TraceSession = {
      id: sessionId,
      startTime: Date.now(),
      entries: [],
      userRequest,
      model,
      config,
      status: 'active',
      toolCallCount: 0,
      successCount: 0,
      failureCount: 0,
      reflections: 0
    };

    this.sessions.set(sessionId, session);
    this.cleanupOldSessions();
    return session;
  }

  addEntry(sessionId: string, entry: TraceEntry): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.entries.push(entry);
      this.saveSession(sessionId);
    }
  }

  updateSessionStatus(sessionId: string, status: TraceSession['status']): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.endTime = Date.now();
      this.saveSession(sessionId);
    }
  }

  incrementToolCall(sessionId: string, success: boolean): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.toolCallCount++;
      if (success) {
        session.successCount++;
      } else {
        session.failureCount++;
      }
    }
  }

  recordReflection(sessionId: string, result: any): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.reflections++;
      this.addEntry(sessionId, {
        timestamp: Date.now(),
        type: 'reflection',
        message: `反思完成: ${result.shouldContinue ? '继续执行' : '任务完成'}`,
        details: result
      });
    }
  }

  private saveSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        const filePath = path.join(this.traceDir, `${sessionId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
      } catch (error) {
        console.error('保存轨迹失败:', error);
      }
    }
  }

  private cleanupOldSessions(): void {
    if (this.sessions.size > this.maxSessions) {
      const oldestIds = Array.from(this.sessions.keys()).slice(0, this.sessions.size - this.maxSessions);
      for (const id of oldestIds) {
        this.sessions.delete(id);
      }
    }
  }

  getSession(sessionId: string): TraceSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): TraceSession[] {
    return Array.from(this.sessions.values());
  }

  getRecentSessions(count: number = 10): TraceSession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, count);
  }

  exportSession(sessionId: string, outputPath: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      fs.writeFileSync(outputPath, JSON.stringify(session, null, 2));
      return true;
    } catch (error) {
      console.error('导出轨迹失败:', error);
      return false;
    }
  }

  generateReport(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return '会话不存在';
    }

    const duration = (session.endTime || Date.now()) - session.startTime;
    const successRate = session.toolCallCount > 0 
      ? ((session.successCount / session.toolCallCount) * 100).toFixed(1) 
      : '0';

    let report = `=== 会话轨迹报告 ===\n\n`;
    report += `会话ID: ${session.id}\n`;
    report += `用户请求: ${session.userRequest.substring(0, 100)}...\n`;
    report += `模型: ${session.model || '未知'}\n`;
    report += `开始时间: ${new Date(session.startTime).toLocaleString()}\n`;
    report += `结束时间: ${session.endTime ? new Date(session.endTime).toLocaleString() : '进行中'}\n`;
    report += `持续时间: ${duration}ms\n\n`;
    report += `=== 统计信息 ===\n`;
    report += `工具调用次数: ${session.toolCallCount}\n`;
    report += `成功次数: ${session.successCount}\n`;
    report += `失败次数: ${session.failureCount}\n`;
    report += `成功率: ${successRate}%\n`;
    report += `反思次数: ${session.reflections}\n`;
    report += `状态: ${session.status}\n\n`;
    report += `=== 最近事件 ===\n`;

    const recentEntries = session.entries.slice(-10);
    for (const entry of recentEntries) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      report += `[${time}] ${entry.type}: ${entry.message}\n`;
      if (entry.details) {
        report += `    详情: ${JSON.stringify(entry.details).substring(0, 100)}...\n`;
      }
    }

    return report;
  }

  clearAll(): void {
    this.sessions.clear();
    try {
      if (fs.existsSync(this.traceDir)) {
        fs.rmSync(this.traceDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('清除轨迹失败:', error);
    }
  }
}

export function createTraceEntry(
  type: TraceEntry['type'],
  message: string,
  details?: any,
  sessionId?: string,
  iteration?: number
): TraceEntry {
  return {
    timestamp: Date.now(),
    type,
    message,
    details,
    sessionId,
    iteration
  };
}

export function logToolCall(sessionId: string, toolType: string, success: boolean, output?: string, iteration?: number): void {
  const traceManager = TraceManager.getInstance();
  traceManager.incrementToolCall(sessionId, success);
  traceManager.addEntry(sessionId, createTraceEntry(
    success ? 'tool_result' : 'error',
    `${toolType} ${success ? '执行成功' : '执行失败'}`,
    { toolType, output, success },
    sessionId,
    iteration
  ));
}

export function logReflection(sessionId: string, result: any, iteration?: number): void {
  const traceManager = TraceManager.getInstance();
  traceManager.recordReflection(sessionId, result);
}

export function logCompletion(sessionId: string, feedback: string, progress: number, iteration?: number): void {
  const traceManager = TraceManager.getInstance();
  traceManager.addEntry(sessionId, createTraceEntry(
    'completion',
    `任务完成: ${feedback}`,
    { feedback, progress },
    sessionId,
    iteration
  ));
}

export function logError(sessionId: string, error: string, details?: any, iteration?: number): void {
  const traceManager = TraceManager.getInstance();
  traceManager.addEntry(sessionId, createTraceEntry(
    'error',
    `错误: ${error}`,
    details,
    sessionId,
    iteration
  ));
}

export function logInfo(sessionId: string, message: string, details?: any, iteration?: number): void {
  const traceManager = TraceManager.getInstance();
  traceManager.addEntry(sessionId, createTraceEntry(
    'info',
    message,
    details,
    sessionId,
    iteration
  ));
}

export function logWarning(sessionId: string, message: string, details?: any, iteration?: number): void {
  const traceManager = TraceManager.getInstance();
  traceManager.addEntry(sessionId, createTraceEntry(
    'warning',
    message,
    details,
    sessionId,
    iteration
  ));
}

export function getTraceReport(sessionId: string): string {
  return TraceManager.getInstance().generateReport(sessionId);
}

export function exportTrace(sessionId: string, outputPath: string): boolean {
  return TraceManager.getInstance().exportSession(sessionId, outputPath);
}

export function getRecentTraces(count: number = 5): TraceSession[] {
  return TraceManager.getInstance().getRecentSessions(count);
}

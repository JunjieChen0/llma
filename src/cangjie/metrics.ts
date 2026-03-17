// cangjie/metrics.ts - 仓颉语言可观测指标系统
// 用于跟踪和分析仓颉代码生成的质量和准确性

export interface CangjieMetrics {
  // 编译相关指标
  totalCompilations: number;      // 总编译次数
  successfulCompilations: number; // 成功编译次数
  failedCompilations: number;     // 失败编译次数
  firstAttemptSuccess: number;    // 首次编译成功次数
  
  // 修复相关指标
  totalRepairs: number;           // 总修复次数
  successfulRepairs: number;      // 成功修复次数
  averageRepairIterations: number; // 平均修复迭代次数
  
  // 接受率指标
  completionsShown: number;       // 补全展示次数
  completionsAccepted: number;    // 补全接受次数
  acceptanceRate: number;         // 接受率百分比
  
  // 错误类型统计
  errorTypes: {
    syntax: number;               // 语法错误
    type: number;                 // 类型错误
    semantic: number;             // 语义错误
    other: number;                // 其他错误
  };
  
  // 会话信息
  sessionStart: number;           // 会话开始时间
  lastActivity: number;           // 最后活动时间
}

export class CangjieMetricsTracker {
  private metrics: CangjieMetrics;
  private repairIterations: number[] = [];
  
  constructor() {
    this.metrics = {
      totalCompilations: 0,
      successfulCompilations: 0,
      failedCompilations: 0,
      firstAttemptSuccess: 0,
      totalRepairs: 0,
      successfulRepairs: 0,
      averageRepairIterations: 0,
      completionsShown: 0,
      completionsAccepted: 0,
      acceptanceRate: 0,
      errorTypes: {
        syntax: 0,
        type: 0,
        semantic: 0,
        other: 0
      },
      sessionStart: Date.now(),
      lastActivity: Date.now()
    };
  }
  
  // 记录编译事件
  recordCompilation(success: boolean, attempt: number = 1): void {
    this.metrics.totalCompilations++;
    this.metrics.lastActivity = Date.now();
    
    if (success) {
      this.metrics.successfulCompilations++;
      if (attempt === 1) {
        this.metrics.firstAttemptSuccess++;
      }
    } else {
      this.metrics.failedCompilations++;
    }
  }
  
  // 记录修复事件
  recordRepair(success: boolean, iterations: number): void {
    this.metrics.totalRepairs++;
    this.metrics.lastActivity = Date.now();
    this.repairIterations.push(iterations);
    
    if (success) {
      this.metrics.successfulRepairs++;
    }
    
    // 更新平均修复迭代次数
    const totalIterations = this.repairIterations.reduce((a, b) => a + b, 0);
    this.metrics.averageRepairIterations = totalIterations / this.repairIterations.length;
  }
  
  // 记录补全展示
  recordCompletionShown(): void {
    this.metrics.completionsShown++;
    this.metrics.lastActivity = Date.now();
  }
  
  // 记录补全接受
  recordCompletionAccepted(): void {
    this.metrics.completionsAccepted++;
    this.metrics.lastActivity = Date.now();
    
    // 更新接受率
    if (this.metrics.completionsShown > 0) {
      this.metrics.acceptanceRate = Math.round(
        (this.metrics.completionsAccepted / this.metrics.completionsShown) * 100
      );
    }
  }
  
  // 记录错误类型
  recordErrorType(type: 'syntax' | 'type' | 'semantic' | 'other'): void {
    this.metrics.errorTypes[type]++;
    this.metrics.lastActivity = Date.now();
  }
  
  // 获取当前指标
  getMetrics(): CangjieMetrics {
    return { ...this.metrics };
  }
  
  // 获取统计摘要
  getSummary(): string {
    const m = this.metrics;
    const compileSuccessRate = m.totalCompilations > 0 
      ? Math.round((m.successfulCompilations / m.totalCompilations) * 100) 
      : 0;
    
    const firstAttemptRate = m.totalCompilations > 0
      ? Math.round((m.firstAttemptSuccess / m.totalCompilations) * 100)
      : 0;
    
    const sessionDuration = Math.round((Date.now() - m.sessionStart) / 1000 / 60); // 分钟
    
    return `
=== 仓颉代码生成质量报告 ===
会话时长：${sessionDuration} 分钟

编译质量:
- 总编译次数：${m.totalCompilations}
- 编译成功率：${compileSuccessRate}%
- 首次编译成功率：${firstAttemptRate}%
- 平均修复迭代：${m.averageRepairIterations.toFixed(2)} 次

代码接受:
- 补全展示：${m.completionsShown}
- 补全接受：${m.completionsAccepted}
- 接受率：${m.acceptanceRate}%

错误分布:
- 语法错误：${m.errorTypes.syntax}
- 类型错误：${m.errorTypes.type}
- 语义错误：${m.errorTypes.semantic}
- 其他错误：${m.errorTypes.other}
`.trim();
  }
  
  // 重置指标
  reset(): void {
    this.metrics = {
      totalCompilations: 0,
      successfulCompilations: 0,
      failedCompilations: 0,
      firstAttemptSuccess: 0,
      totalRepairs: 0,
      successfulRepairs: 0,
      averageRepairIterations: 0,
      completionsShown: 0,
      completionsAccepted: 0,
      acceptanceRate: 0,
      errorTypes: {
        syntax: 0,
        type: 0,
        semantic: 0,
        other: 0
      },
      sessionStart: Date.now(),
      lastActivity: Date.now()
    };
    this.repairIterations = [];
  }
}

// 全局指标跟踪器实例
let globalTracker: CangjieMetricsTracker | null = null;

export function getCangjieMetricsTracker(): CangjieMetricsTracker {
  if (!globalTracker) {
    globalTracker = new CangjieMetricsTracker();
  }
  return globalTracker;
}

// 导出便捷函数
export function recordCompilation(success: boolean, attempt?: number) {
  getCangjieMetricsTracker().recordCompilation(success, attempt);
}

export function recordRepair(success: boolean, iterations: number) {
  getCangjieMetricsTracker().recordRepair(success, iterations);
}

export function recordCompletionShown() {
  getCangjieMetricsTracker().recordCompletionShown();
}

export function recordCompletionAccepted() {
  getCangjieMetricsTracker().recordCompletionAccepted();
}

export function recordErrorType(type: 'syntax' | 'type' | 'semantic' | 'other') {
  getCangjieMetricsTracker().recordErrorType(type);
}

export function getMetricsSummary(): string {
  return getCangjieMetricsTracker().getSummary();
}

/**
 * 任务系统类型定义文件
 * 
 * 定义了任务规划和执行系统的所有类型和接口，包括：
 * - 任务状态：任务的执行状态
 * - 任务优先级：任务的优先级级别
 * - 任务依赖：步骤之间的依赖关系
 * - 任务步骤：单个任务的执行步骤
 * - 复杂任务：包含多个步骤的复杂任务
 * - 任务计划：任务的执行计划
 * - 执行结果：任务执行的结果
 * - 检查点：任务执行过程中的状态快照
 * 
 * @module task/taskTypes
 */

import * as vscode from 'vscode';

/**
 * 任务状态枚举
 * 
 * 定义任务在执行过程中的各种状态。
 * 
 * @enum TaskStatus
 */
export enum TaskStatus {
  /**
   * 待执行
   * 任务已创建但尚未开始执行
   */
  PENDING = 'pending',
  
  /**
   * 规划中
   * 任务正在被分解为可执行的步骤
   */
  PLANNING = 'planning',
  
  /**
   * 运行中
   * 任务或步骤正在执行
   */
  RUNNING = 'running',
  
  /**
   * 已完成
   * 任务或步骤成功完成
   */
  COMPLETED = 'completed',
  
  /**
   * 失败
   * 任务或步骤执行失败
   */
  FAILED = 'failed',
  
  /**
   * 已取消
   * 任务被用户或系统取消
   */
  CANCELLED = 'cancelled',
  
  /**
   * 已暂停
   * 任务被暂停，等待恢复
   */
  PAUSED = 'paused',
  
  /**
   * 回滚中
   * 任务正在回滚到之前的检查点
   */
  ROLLBACK = 'rollback'
}

/**
 * 任务优先级枚举
 * 
 * 定义任务的优先级级别，用于任务调度。
 * 
 * @enum TaskPriority
 */
export enum TaskPriority {
  /**
   * 低优先级
   * 可以延后执行的任务
   */
  LOW = 0,
  
  /**
   * 中等优先级
   * 常规任务
   */
  MEDIUM = 1,
  
  /**
   * 高优先级
   * 需要尽快执行的任务
   */
  HIGH = 2,
  
  /**
   * 关键优先级
   * 必须立即执行的任务
   */
  CRITICAL = 3
}

/**
 * 任务依赖接口
 * 
 * 定义任务步骤之间的依赖关系。
 * 
 * @interface TaskDependency
 */
export interface TaskDependency {
  /**
   * 依赖的任务 ID
   */
  taskId: string;
  
  /**
   * 依赖类型
   * - 'sequential': 顺序依赖，必须按顺序执行
   * - 'parallel': 并行依赖，可以同时执行
   * - 'conditional': 条件依赖，根据条件决定是否执行
   */
  type: 'sequential' | 'parallel' | 'conditional';
  
  /**
   * 条件表达式
   * 当 type 为 'conditional' 时使用
   */
  condition?: string;
}

/**
 * 任务步骤接口
 * 
 * 定义复杂任务中的单个执行步骤。
 * 
 * @interface TaskStep
 */
export interface TaskStep {
  /**
   * 步骤唯一标识符
   */
  id: string;
  
  /**
   * 步骤名称
   */
  name: string;
  
  /**
   * 步骤描述
   */
  description: string;
  
  /**
   * 使用的工具类型
   * 如 'READ', 'RUN', 'FILE' 等
   */
  toolType: string;
  
  /**
   * 工具参数
   * 传递给工具的具体参数
   */
  parameters: any;
  
  /**
   * 步骤状态
   */
  status: TaskStatus;
  
  /**
   * 开始时间
   * 步骤开始执行的时间戳
   */
  startTime?: number;
  
  /**
   * 结束时间
   * 步骤执行完成的时间戳
   */
  endTime?: number;
  
  /**
   * 输出结果
   * 步骤执行后的输出
   */
  output?: string;
  
  /**
   * 错误信息
   * 如果步骤失败，包含错误详情
   */
  error?: string;
  
  /**
   * 重试次数
   * 当前已重试的次数
   */
  retryCount: number;
  
  /**
   * 最大重试次数
   * 允许的最大重试次数
   */
  maxRetries: number;
  
  /**
   * 依赖的步骤 ID 列表
   * 此步骤依赖的其他步骤
   */
  dependencies: string[];
}

/**
 * 复杂任务接口
 * 
 * 定义包含多个步骤的复杂任务。
 * 
 * @interface ComplexTask
 */
export interface ComplexTask {
  /**
   * 任务唯一标识符
   */
  id: string;
  
  /**
   * 任务名称
   */
  name: string;
  
  /**
   * 任务描述
   */
  description: string;
  
  /**
   * 任务状态
   */
  status: TaskStatus;
  
  /**
   * 任务优先级
   */
  priority: TaskPriority;
  
  /**
   * 创建时间
   */
  createdAt: number;
  
  /**
   * 开始时间
   */
  startedAt?: number;
  
  /**
   * 完成时间
   */
  completedAt?: number;
  
  /**
   * 所有步骤
   */
  steps: TaskStep[];
  
  /**
   * 当前步骤索引
   */
  currentStepIndex: number;
  
  /**
   * 总步骤数
   */
  totalSteps: number;
  
  /**
   * 进度百分比
   * 0-100 之间的数值
   */
  progress: number;
  
  /**
   * 元数据
   */
  metadata: {
    /**
     * 关联的会话 ID
     */
    sessionId?: string;
    
    /**
     * 用户 ID
     */
    userId?: string;
    
    /**
     * 标签
     */
    tags?: string[];
    
    /**
     * 预计持续时间（毫秒）
     */
    estimatedDuration?: number;
  };
  
  /**
   * 回滚数据
   */
  rollbackData: {
    /**
     * 文件快照
     * 文件路径到内容的映射
     */
    snapshots: Map<string, string>;
    
    /**
     * 检查点
     * 检查点 ID 到状态的映射
     */
    checkpoints: Map<string, any>;
  };
}

/**
 * 任务计划接口
 * 
 * 定义任务的执行计划。
 * 
 * @interface TaskPlan
 */
export interface TaskPlan {
  /**
   * 任务 ID
   */
  taskId: string;
  
  /**
   * 所有步骤
   */
  steps: TaskStep[];
  
  /**
   * 预计持续时间（毫秒）
   */
  estimatedDuration: number;
  
  /**
   * 资源需求
   */
  resourceRequirements: {
    /**
     * 内存需求（MB）
     */
    memory: number;
    
    /**
     * CPU 需求（百分比）
     */
    cpu: number;
    
    /**
     * 磁盘需求（MB）
     */
    disk: number;
  };
  
  /**
   * 风险评估
   */
  riskAssessment: {
    /**
     * 风险级别
     */
    level: 'low' | 'medium' | 'high';
    
    /**
     * 风险因素
     */
    factors: string[];
  };
}

/**
 * 任务执行结果接口
 * 
 * 定义任务执行后的结果。
 * 
 * @interface TaskExecutionResult
 */
export interface TaskExecutionResult {
  /**
   * 任务 ID
   */
  taskId: string;
  
  /**
   * 是否成功
   */
  success: boolean;
  
  /**
   * 已执行的步骤数
   */
  stepsExecuted: number;
  
  /**
   * 失败的步骤数
   */
  stepsFailed: number;
  
  /**
   * 总耗时（毫秒）
   */
  totalTime: number;
  
  /**
   * 输出内容
   */
  output: string;
  
  /**
   * 错误信息
   */
  error?: string;
  
  /**
   * 是否需要回滚
   */
  rollbackRequired: boolean;
}

/**
 * 任务检查点接口
 * 
 * 定义任务执行过程中的状态快照。
 * 
 * @interface TaskCheckpoint
 */
export interface TaskCheckpoint {
  /**
   * 检查点唯一标识符
   */
  id: string;
  
  /**
   * 任务 ID
   */
  taskId: string;
  
  /**
   * 步骤 ID
   */
  stepId: string;
  
  /**
   * 时间戳
   */
  timestamp: number;
  
  /**
   * 状态数据
   */
  state: {
    /**
     * 文件快照
     */
    files: Map<string, string>;
    
    /**
     * 环境变量
     */
    environment: any;
    
    /**
     * 变量映射
     */
    variables: Map<string, any>;
  };
}

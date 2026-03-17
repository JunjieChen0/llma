// src/task/taskManager.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TaskStatus, TaskPriority, TaskStep, ComplexTask, TaskPlan, TaskExecutionResult, TaskCheckpoint } from './taskTypes';
import { TaskPlanner, TaskPlanningContext, TaskExecutionContext } from './taskPlanner';
import { toolRegistry, registerAllTools } from '../chat/toolUnified';
import { v4 as uuidv4 } from 'uuid';

let taskToolsRegistered = false;
function ensureTaskToolsRegistered(): void {
    if (!taskToolsRegistered) {
        registerAllTools();
        taskToolsRegistered = true;
    }
}

export interface TaskExecutionCallbacks {
    onStepStart?: (step: TaskStep) => void;
    onStepComplete?: (step: TaskStep, result: string) => void;
    onStepError?: (step: TaskStep, error: string) => void;
    onProgress?: (progress: number, currentStep: number, totalSteps: number) => void;
    onPlanGenerated?: (plan: TaskPlan) => void;
    onTaskComplete?: (result: TaskExecutionResult) => void;
}

export class TaskManager {
    private static instance: TaskManager;
    private tasks: Map<string, ComplexTask> = new Map();
    private currentTask: ComplexTask | null = null;
    private planner: TaskPlanner;
    private callbacks: TaskExecutionCallbacks = {};
    private abortSignal: AbortSignal | null = null;
    private executionContext: TaskExecutionContext | null = null;

    static getInstance(): TaskManager {
        if (!TaskManager.instance) {
            TaskManager.instance = new TaskManager();
        }
        return TaskManager.instance;
    }

    constructor() {
        this.planner = TaskPlanner.getInstance();
    }

    setCallbacks(callbacks: TaskExecutionCallbacks) {
        this.callbacks = callbacks;
    }

    setAbortSignal(signal: AbortSignal | null) {
        this.abortSignal = signal;
    }

    async planAndExecute(
        userRequest: string,
        context: TaskExecutionContext,
        signal?: AbortSignal
    ): Promise<TaskExecutionResult> {
        this.abortSignal = signal || null;
        this.executionContext = context;
        
        const task: ComplexTask = {
            id: uuidv4(),
            name: userRequest.substring(0, 50),
            description: userRequest,
            status: TaskStatus.PLANNING,
            priority: TaskPriority.MEDIUM,
            createdAt: Date.now(),
            steps: [],
            currentStepIndex: 0,
            totalSteps: 0,
            progress: 0,
            metadata: {},
            rollbackData: {
                snapshots: new Map(),
                checkpoints: new Map()
            }
        };

        this.tasks.set(task.id, task);
        this.currentTask = task;

        try {
            task.status = TaskStatus.PLANNING;
            
            const plan = await this.planner.planTask(userRequest, context, signal);
            task.steps = plan.steps;
            task.totalSteps = plan.steps.length;
            
            if (this.callbacks.onPlanGenerated) {
                this.callbacks.onPlanGenerated(plan);
            }

            const optimizedPlan = this.planner.optimizePlan(plan);
            task.steps = optimizedPlan.steps;

            return await this.executeTask(task);
        } catch (error: unknown) {
            task.status = TaskStatus.FAILED;
            const errMsg = error instanceof Error ? error.message : String(error);
            return {
                taskId: task.id,
                success: false,
                stepsExecuted: 0,
                stepsFailed: 0,
                totalTime: Date.now() - task.createdAt,
                output: '',
                error: errMsg,
                rollbackRequired: false
            };
        } finally {
            this.executionContext = null;
        }
    }

    async executeTask(task: ComplexTask): Promise<TaskExecutionResult> {
        task.status = TaskStatus.RUNNING;
        task.startedAt = Date.now();

        let stepsExecuted = 0;
        let stepsFailed = 0;
        let output = '';

        for (let i = 0; i < task.steps.length; i++) {
            if (this.abortSignal?.aborted) {
                task.status = TaskStatus.CANCELLED;
                break;
            }

            task.currentStepIndex = i;
            const step = task.steps[i];

            if (!this.canExecuteStep(step, task.steps)) {
                step.status = TaskStatus.PENDING;
                continue;
            }

            step.status = TaskStatus.RUNNING;
            step.startTime = Date.now();

            if (this.callbacks.onStepStart) {
                this.callbacks.onStepStart(step);
            }

            if (this.callbacks.onProgress) {
                this.callbacks.onProgress(
                    (i / task.totalSteps) * 100,
                    i + 1,
                    task.totalSteps
                );
            }

            try {
                const result = await this.executeStep(step, task);
                step.status = TaskStatus.COMPLETED;
                step.endTime = Date.now();
                step.output = result;

                stepsExecuted++;
                output += `\n[${step.name}] 完成: ${result}\n`;

                if (this.callbacks.onStepComplete) {
                    this.callbacks.onStepComplete(step, result);
                }

                await this.createCheckpoint(task, step);

            } catch (error: unknown) {
                step.status = TaskStatus.FAILED;
                step.error = error instanceof Error ? error.message : String(error);
                step.endTime = Date.now();
                stepsFailed++;

                const errMsg = error instanceof Error ? error.message : String(error);
                output += `\n[${step.name}] 失败: ${errMsg}\n`;

                if (this.callbacks.onStepError) {
                    this.callbacks.onStepError(step, errMsg);
                }

                if (step.retryCount < step.maxRetries) {
                    step.retryCount++;
                    step.status = TaskStatus.PENDING;
                    i--;
                } else {
                    const shouldContinue = await this.handleStepFailure(task, step, error);
                    if (!shouldContinue) {
                        break;
                    }
                }
            }

            task.progress = (i + 1) / task.totalSteps * 100;
        }

        task.status = stepsFailed > 0 ? TaskStatus.FAILED : TaskStatus.COMPLETED;
        task.completedAt = Date.now();

        const result: TaskExecutionResult = {
            taskId: task.id,
            success: task.status === TaskStatus.COMPLETED,
            stepsExecuted,
            stepsFailed,
            totalTime: task.completedAt - task.createdAt,
            output,
            error: stepsFailed > 0 ? `${stepsFailed} 个步骤失败` : undefined,
            rollbackRequired: stepsFailed > 0
        };

        if (this.callbacks.onTaskComplete) {
            this.callbacks.onTaskComplete(result);
        }

        return result;
    }

    private canExecuteStep(step: TaskStep, allSteps: TaskStep[]): boolean {
        for (const depId of step.dependencies) {
            const depStep = allSteps.find(s => s.id === depId);
            if (!depStep || depStep.status !== TaskStatus.COMPLETED) {
                return false;
            }
        }
        return true;
    }

    private async executeStep(step: TaskStep, task: ComplexTask): Promise<string> {
        ensureTaskToolsRegistered();
        const ctx = this.executionContext;
        if (ctx) {
            const tool = toolRegistry.get(step.toolType);
            if (tool) {
                const toolCtx = {
                    provider: ctx.provider,
                    history: ctx.history,
                    config: ctx.config,
                    abortSignal: this.abortSignal || undefined
                };
                return await tool.execute(step.parameters || {}, toolCtx);
            }
        }
        throw new Error(`未知工具类型: ${step.toolType}`);
    }

    private async handleStepFailure(task: ComplexTask, step: TaskStep, error: unknown): Promise<boolean> {
        const errMsg = error instanceof Error ? error.message : String(error);
        const userChoice = await vscode.window.showWarningMessage(
            `步骤 "${step.name}" 执行失败: ${errMsg}`,
            { modal: true },
            '重试', '跳过', '停止'
        );

        switch (userChoice) {
            case '重试':
                step.status = TaskStatus.PENDING;
                return true;
            case '跳过':
                return true;
            case '停止':
            default:
                return false;
        }
    }

    async createCheckpoint(task: ComplexTask, step: TaskStep): Promise<void> {
        const checkpoint: TaskCheckpoint = {
            id: uuidv4(),
            taskId: task.id,
            stepId: step.id,
            timestamp: Date.now(),
            state: {
                files: new Map(task.rollbackData.snapshots),
                environment: {},
                variables: new Map()
            }
        };

        task.rollbackData.checkpoints.set(step.id, checkpoint);
    }

    async rollbackToCheckpoint(taskId: string, checkpointId: string): Promise<boolean> {
        const task = this.tasks.get(taskId);
        if (!task) return false;

        const checkpoint = task.rollbackData.checkpoints.get(checkpointId);
        if (!checkpoint) return false;

        task.status = TaskStatus.ROLLBACK;

        for (const [filepath, content] of checkpoint.state.files) {
            const fullPath = this.resolvePath(filepath);
            await fs.promises.writeFile(fullPath, content, 'utf-8');
        }

        return true;
    }

    async rollback(taskId: string): Promise<boolean> {
        const task = this.tasks.get(taskId);
        if (!task) return false;

        task.status = TaskStatus.ROLLBACK;

        for (const [filepath, content] of task.rollbackData.snapshots) {
            const fullPath = this.resolvePath(filepath);
            if (content !== null) {
                await fs.promises.writeFile(fullPath, content, 'utf-8');
            }
        }

        task.status = TaskStatus.CANCELLED;
        return true;
    }

    private resolvePath(filepath: string): string {
        const workspaceRoot = this.getWorkspaceRoot();
        if (path.isAbsolute(filepath)) {
            return filepath;
        }
        return path.join(workspaceRoot, filepath);
    }

    private getWorkspaceRoot(): string {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            return folders[0].uri.fsPath;
        }
        return process.cwd();
    }

    getTask(taskId: string): ComplexTask | undefined {
        return this.tasks.get(taskId);
    }

    getCurrentTask(): ComplexTask | null {
        return this.currentTask;
    }

    getAllTasks(): ComplexTask[] {
        return Array.from(this.tasks.values());
    }

    cancelTask(taskId: string): boolean {
        const task = this.tasks.get(taskId);
        if (task && task.status === TaskStatus.RUNNING) {
            task.status = TaskStatus.CANCELLED;
            return true;
        }
        return false;
    }

    clearCompletedTasks(): void {
        for (const [id, task] of this.tasks) {
            if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED) {
                this.tasks.delete(id);
            }
        }
    }
}

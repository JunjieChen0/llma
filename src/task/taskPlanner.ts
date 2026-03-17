// src/task/taskPlanner.ts
import * as vscode from 'vscode';
import { callSimpleAI } from '../api';
import { getApiKey } from '../config';
import { TaskStep, TaskPlan, TaskStatus, TaskPriority } from './taskTypes';
import { AI } from '../constants';
import { v4 as uuidv4 } from 'uuid';

/** 任务规划上下文（规划阶段） */
export interface TaskPlanningContext {
    workspaceRoot: string;
    openFiles: string[];
    activeFile?: string;
    language?: string;
    diagnostics: string[];
}

/** 任务执行上下文（执行阶段，需 provider 以使用统一工具） */
export interface TaskExecutionContext extends TaskPlanningContext {
    provider: import('../chat/index').LLMAChatProvider;
    history: import('../types').ChatHistory;
    config: import('vscode').WorkspaceConfiguration;
}

export class TaskPlanner {
    private static instance: TaskPlanner;
    private config: vscode.WorkspaceConfiguration | null = null;

    static getInstance(): TaskPlanner {
        if (!TaskPlanner.instance) {
            TaskPlanner.instance = new TaskPlanner();
        }
        return TaskPlanner.instance;
    }

    setConfig(config: vscode.WorkspaceConfiguration) {
        this.config = config;
    }

    async planTask(
        userRequest: string,
        context: TaskPlanningContext,
        signal?: AbortSignal
    ): Promise<TaskPlan> {
        const planningPrompt = this.generatePlanningPrompt(userRequest, context);
        
        const config = this.config || vscode.workspace.getConfiguration('llma');
        const model = config.get<string>('currentModel') || 'deepseek';
        const apiKey = getApiKey(config, model);

        if (!apiKey) {
            throw new Error('API Key 未配置');
        }

        const systemPrompt = `你是一个专业的任务规划专家。你的任务是将用户的复杂请求分解为具体的、可执行的步骤。
每个步骤必须包含：
1. 步骤名称（name）
2. 步骤描述（description）
3. 使用的工具类型（toolType）
4. 工具参数（parameters）
5. 依赖的前置步骤ID（dependencies）

支持的工具类型：
- READ: 读取文件内容
- RUN: 执行命令
- FILE: 创建/修改文件
- MKDIR: 创建目录
- REPLACE: 文本替换
- EDIT_FUNCTION: 编辑函数
- EDIT_CLASS: 编辑类
- BUILD: 编译项目
- TEST: 运行测试

请以 JSON 数组格式返回步骤，每个步骤包含以下字段：
{
    "id": "步骤唯一ID",
    "name": "步骤名称",
    "description": "步骤详细描述",
    "toolType": "工具类型",
    "parameters": { /* 工具参数 */ },
    "dependencies": ["依赖的步骤ID"]
}

注意：
1. 步骤应该按照逻辑顺序排列
2. 每个步骤必须可以独立执行（除依赖外）
3. 如果需要先了解项目结构，第一步应该是 READ workspace 或 RUN 命令查看目录
4. 返回纯 JSON 数组，不要包含任何其他文字`;

        try {
            const response = await callSimpleAI(
                model,
                apiKey,
                systemPrompt,
                planningPrompt,
                AI.TASK_PLANNING_MAX_TOKENS,
                0.3,
                config,
                signal
            );

            const steps = this.parseStepsResponse(response);
            return this.createTaskPlan(steps, userRequest);
        } catch (error: any) {
            if (signal?.aborted) {
                throw new Error('任务规划已取消');
            }
            throw new Error(`任务规划失败: ${error.message}`);
        }
    }

    private generatePlanningPrompt(userRequest: string, context: TaskPlanningContext): string {
        let prompt = `# 任务规划请求\n\n`;
        prompt += `## 用户请求\n${userRequest}\n\n`;
        prompt += `## 当前工作区\n`;
        prompt += `- 工作区根目录: ${context.workspaceRoot}\n`;
        
        if (context.activeFile) {
            prompt += `- 当前活动文件: ${context.activeFile}\n`;
            prompt += `- 语言: ${context.language || 'unknown'}\n`;
        }
        
        if (context.openFiles.length > 0) {
            prompt += `- 已打开文件:\n`;
            for (const file of context.openFiles.slice(0, 10)) {
                prompt += `  - ${file}\n`;
            }
        }

        if (context.diagnostics.length > 0) {
            prompt += `\n## 当前诊断信息\n`;
            for (const diag of context.diagnostics.slice(0, 5)) {
                prompt += `- ${diag}\n`;
            }
        }

        prompt += `\n请根据以上信息规划任务步骤。`;
        return prompt;
    }

    private parseStepsResponse(response: string): Partial<TaskStep>[] {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('无法解析任务步骤');
        }

        try {
            const steps = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(steps)) {
                throw new Error('返回格式错误');
            }
            return steps;
        } catch (error: any) {
            throw new Error(`JSON 解析失败: ${error.message}`);
        }
    }

    private createTaskPlan(steps: Partial<TaskStep>[], userRequest: string): TaskPlan {
        const validSteps: TaskStep[] = steps.map((step, index) => ({
            id: step.id || `step_${index + 1}`,
            name: step.name || `步骤 ${index + 1}`,
            description: step.description || '',
            toolType: step.toolType || 'RUN',
            parameters: step.parameters || {},
            status: TaskStatus.PENDING,
            retryCount: 0,
            maxRetries: step.maxRetries || 2,
            dependencies: step.dependencies || []
        }));

        const estimatedDuration = this.estimateDuration(validSteps);

        return {
            taskId: uuidv4(),
            steps: validSteps,
            estimatedDuration,
            resourceRequirements: {
                memory: 256,
                cpu: 10,
                disk: 100
            },
            riskAssessment: {
                level: this.assessRisk(validSteps),
                factors: this.identifyRiskFactors(validSteps)
            }
        };
    }

    private estimateDuration(steps: TaskStep[]): number {
        const toolDurations: Record<string, number> = {
            READ: 1000,
            RUN: 5000,
            FILE: 2000,
            MKDIR: 500,
            REPLACE: 1500,
            EDIT_FUNCTION: 2000,
            EDIT_CLASS: 3000,
            BUILD: 10000,
            TEST: 15000
        };

        let total = 0;
        for (const step of steps) {
            const baseDuration = toolDurations[step.toolType] || 3000;
            const dependencyDelay = step.dependencies.length * 500;
            total += baseDuration + dependencyDelay;
        }

        return total;
    }

    private assessRisk(steps: TaskStep[]): 'low' | 'medium' | 'high' {
        const riskyTools = ['RUN', 'BUILD', 'TEST'];
        const riskySteps = steps.filter(s => riskyTools.includes(s.toolType));
        
        if (riskySteps.length > 3) return 'high';
        if (riskySteps.length > 1) return 'medium';
        return 'low';
    }

    private identifyRiskFactors(steps: TaskStep[]): string[] {
        const factors: string[] = [];
        
        const hasBuild = steps.some(s => s.toolType === 'BUILD');
        if (hasBuild) factors.push('包含编译步骤，可能失败');
        
        const hasTest = steps.some(s => s.toolType === 'TEST');
        if (hasTest) factors.push('包含测试步骤，依赖编译成功');
        
        const hasFileCreate = steps.filter(s => s.toolType === 'FILE').length;
        if (hasFileCreate > 5) factors.push(`创建 ${hasFileCreate} 个文件，风险较高`);
        
        const hasDelete = steps.some(s => 
            s.toolType === 'RUN' && 
            (s.parameters.command as string)?.includes('rm')
        );
        if (hasDelete) factors.push('包含删除命令，必须小心');

        return factors;
    }

    optimizePlan(plan: TaskPlan): TaskPlan {
        const steps = this.topologicalSort(plan.steps);
        return {
            ...plan,
            steps
        };
    }

    private topologicalSort(steps: TaskStep[]): TaskStep[] {
        const inDegree = new Map<string, number>();
        const adjacency = new Map<string, string[]>();
        
        for (const step of steps) {
            inDegree.set(step.id, 0);
            adjacency.set(step.id, []);
        }
        
        for (const step of steps) {
            for (const dep of step.dependencies) {
                if (inDegree.has(dep)) {
                    adjacency.get(dep)!.push(step.id);
                    inDegree.set(step.id, inDegree.get(step.id)! + 1);
                }
            }
        }
        
        const queue: string[] = [];
        for (const [id, degree] of inDegree) {
            if (degree === 0) queue.push(id);
        }
        
        const sorted: TaskStep[] = [];
        while (queue.length > 0) {
            const current = queue.shift()!;
            const step = steps.find(s => s.id === current);
            if (step) sorted.push(step);
            
            for (const neighbor of adjacency.get(current)!) {
                const newDegree = inDegree.get(neighbor)! - 1;
                inDegree.set(neighbor, newDegree);
                if (newDegree === 0) queue.push(neighbor);
            }
        }
        
        if (sorted.length !== steps.length) {
            return steps;
        }
        
        return sorted;
    }
}

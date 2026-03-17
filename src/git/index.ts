/**
 * Git 版本控制管理模块
 * 
 * 提供完整的 Git 操作功能，包括：
 * - 状态管理：查看文件修改、暂存、未跟踪等状态
 * - 提交操作：创建提交、生成提交消息
 * - 分支管理：创建、切换、合并分支
 * - 远程操作：推送、拉取、获取远程更新
 * - 历史查看：查看提交历史、文件历史
 * - 暂存操作：暂存和恢复工作区
 * - 差异查看：查看文件和暂存的差异
 * 
 * 主要功能：
 * - 集成 simple-git 库提供 Git 功能
 * - AI 生成提交消息
 * - 快速操作命令（快捷提交、推送、拉取）
 * - 分支选择器界面
 * 
 * @module git/index
 */

import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Git 状态接口
 * 
 * 表示 Git 工作区的当前状态。
 * 
 * @interface GitStatus
 */
export interface GitStatus {
  /**
   * 已修改的文件列表
   */
  modified: string[];
  
  /**
   * 已暂存的文件列表
   */
  added: string[];
  
  /**
   * 已删除的文件列表
   */
  deleted: string[];
  
  /**
   * 已重命名的文件列表
   */
  renamed: string[];
  
  /**
   * 未跟踪的文件列表
   */
  untracked: string[];
}

/**
 * Git 提交信息接口
 * 
 * 表示单个 Git 提交的信息。
 * 
 * @interface GitCommit
 */
export interface GitCommit {
  /**
   * 提交哈希值
   */
  hash: string;
  
  /**
   * 提交消息
   */
  message: string;
  
  /**
   * 提交日期
   */
  date: string;
  
  /**
   * 作者名称
   */
  author: string;
  
  /**
   * 作者邮箱
   */
  email: string;
}

/**
 * Git 差异信息接口
 * 
 * 表示文件或暂存的差异。
 * 
 * @interface GitDiff
 */
export interface GitDiff {
  /**
   * 文件路径
   */
  file: string;
  
  /**
   * 差异内容
   */
  changes: string;
}

/**
 * Git 管理器类
 * 
 * 提供完整的 Git 操作功能，使用单例模式。
 * 
 * @class GitManager
 */
export class GitManager {
  /**
   * 单例实例
   */
  private static instance: GitManager | null = null;
  
  /**
   * SimpleGit 实例
   */
  private git: SimpleGit;
  private repoPath: string;

  private constructor(repoPath: string) {
    this.repoPath = repoPath;
    const options: Partial<SimpleGitOptions> = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: false,
    };
    this.git = simpleGit(options);
  }

  static getInstance(repoPath?: string): GitManager {
    if (!GitManager.instance && repoPath) {
      GitManager.instance = new GitManager(repoPath);
    }
    return GitManager.instance!;
  }

  static resetInstance(): void {
    GitManager.instance = null;
  }

  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.revparse(['--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<GitStatus> {
    const status = await this.git.status();
    return {
      modified: status.modified,
      added: status.staged,
      deleted: status.deleted,
      renamed: status.renamed.map(r => r.to),
      untracked: status.not_added,
    };
  }

  async getDiff(filePath?: string): Promise<string> {
    if (filePath) {
      return await this.git.diff([filePath]);
    }
    return await this.git.diff();
  }

  async getStagedDiff(): Promise<string> {
    return await this.git.diff(['--staged']);
  }

  async add(filePaths: string[] | string = '.'): Promise<void> {
    await this.git.add(filePaths);
  }

  async commit(message: string, options?: { all?: boolean }): Promise<void> {
    if (options?.all) {
      await this.git.commit(message, ['-a']);
    } else {
      await this.git.commit(message);
    }
  }

  async commitWithAI(message: string, files?: string[]): Promise<void> {
    if (files && files.length > 0) {
      await this.git.add(files);
    }
    await this.git.commit(message);
  }

  async push(remote?: string, branch?: string): Promise<void> {
    if (remote && branch) {
      await this.git.push(remote, branch);
    } else {
      await this.git.push();
    }
  }

  async pull(remote?: string, branch?: string): Promise<void> {
    if (remote && branch) {
      await this.git.pull(remote, branch);
    } else {
      await this.git.pull();
    }
  }

  async fetch(remote?: string): Promise<void> {
    if (remote) {
      await this.git.fetch(remote);
    } else {
      await this.git.fetch();
    }
  }

  async getBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current || 'unknown';
  }

  async getBranches(): Promise<string[]> {
    const branches = await this.git.branch();
    return branches.all;
  }

  async checkout(branch: string): Promise<void> {
    await this.git.checkout(branch);
  }

  async createBranch(branchName: string, checkout: boolean = true): Promise<void> {
    if (checkout) {
      await this.git.checkoutLocalBranch(branchName);
    } else {
      await this.git.branch([branchName]);
    }
  }

  async merge(branch: string): Promise<void> {
    await this.git.merge([branch]);
  }

  async getCommitHistory(maxCount: number = 20): Promise<GitCommit[]> {
    const log = await this.git.log({ maxCount });
    return log.all.map(commit => ({
      hash: commit.hash,
      message: commit.message,
      date: commit.date,
      author: commit.author_name,
      email: commit.author_email,
    }));
  }

  async getFileHistory(filePath: string, maxCount: number = 20): Promise<GitCommit[]> {
    const log = await this.git.log({ file: filePath, maxCount });
    return log.all.map(commit => ({
      hash: commit.hash,
      message: commit.message,
      date: commit.date,
      author: commit.author_name,
      email: commit.author_email,
    }));
  }

  async stash(message?: string): Promise<void> {
    if (message) {
      await this.git.stash(['push', '-m', message]);
    } else {
      await this.git.stash();
    }
  }

  async stashPop(): Promise<void> {
    await this.git.stash(['pop']);
  }

  async stashList(): Promise<string[]> {
    const list = await this.git.stashList();
    return list.all.map(item => (item as any).message || (item as any).branch || 'stash');
  }

  async reset(filePath?: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<void> {
    const modeFlag = mode === 'soft' ? '--soft' : mode === 'hard' ? '--hard' : '--mixed';
    if (filePath) {
      await this.git.reset([modeFlag, 'HEAD', '--', filePath]);
    } else {
      await this.git.reset([modeFlag, 'HEAD']);
    }
  }

  async getRemotes(): Promise<{ name: string; url: string }[]> {
    const remotes = await this.git.getRemotes(true);
    return remotes.map(remote => ({
      name: remote.name,
      url: remote.refs.push || remote.refs.fetch || '',
    }));
  }

  async clone(url: string, targetPath: string): Promise<void> {
    await this.git.clone(url, targetPath);
  }

  async init(): Promise<void> {
    await this.git.init();
  }

  async showQuickCommit(): Promise<void> {
    const status = await this.getStatus();
    const allFiles = [...status.modified, ...status.added, ...status.deleted, ...status.untracked];
    
    if (allFiles.length === 0) {
      vscode.window.showInformationMessage('No changes to commit');
      return;
    }

    const message = await vscode.window.showInputBox({
      prompt: 'Enter commit message',
      placeHolder: 'feat: add new feature',
    });

    if (!message) {
      return;
    }

    await this.add('.');
    await this.commit(message);
    vscode.window.showInformationMessage('Commit successful');
  }

  async showQuickPush(): Promise<void> {
    try {
      await this.push();
      vscode.window.showInformationMessage('Push successful');
    } catch (error) {
      vscode.window.showErrorMessage(`Push failed: ${error}`);
    }
  }

  async showQuickPull(): Promise<void> {
    try {
      await this.pull();
      vscode.window.showInformationMessage('Pull successful');
    } catch (error) {
      vscode.window.showErrorMessage(`Pull failed: ${error}`);
    }
  }

  async showBranchPicker(): Promise<void> {
    const branches = await this.getBranches();
    const currentBranch = await this.getBranch();
    
    const selected = await vscode.window.showQuickPick(branches, {
      placeHolder: `Select branch (current: ${currentBranch})`,
    });

    if (selected && selected !== currentBranch) {
      await this.checkout(selected);
      vscode.window.showInformationMessage(`Switched to branch: ${selected}`);
    }
  }

  async showStatusOutput(): Promise<void> {
    const status = await this.getStatus();
    const output = [
      'Git Status:',
      `Modified: ${status.modified.join(', ') || 'none'}`,
      `Added: ${status.added.join(', ') || 'none'}`,
      `Deleted: ${status.deleted.join(', ') || 'none'}`,
      `Untracked: ${status.untracked.join(', ') || 'none'}`,
    ].join('\n');

    vscode.window.showInformationMessage(output);
  }
}

export function createGitManager(repoPath: string): GitManager {
  return GitManager.getInstance(repoPath);
}

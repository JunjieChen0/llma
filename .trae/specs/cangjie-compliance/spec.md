# 仓颉编程语言合规性规范

## Why
当用户提出与仓颉编程语言相关的需求时，需要确保所有代码示例、项目结构和编译指令严格遵循仓颉官方语法规范，避免生成不符合仓颉语言特性的代码。

## What Changes
- 所有仓颉代码必须严格遵循官方语法规范（函数签名、类型声明、控制流等）
- 项目结构必须符合仓颉标准组织方式（src/目录、cjc.json/cjpm.toml 配置）
- 编译命令必须使用正确的 cjc/cjpm 命令格式
- 导入语句、可见性修饰符、类型系统必须完全合规

## Impact
- 影响所有涉及仓颉编程语言的代码生成任务
- 影响项目结构建议和编译配置
- 影响错误诊断和修复建议

## ADDED Requirements
### Requirement: 仓颉代码合规性
系统 SHALL 在生成任何仓颉代码时严格遵循以下规则：

#### Scenario: 函数定义
- **WHEN** 用户需要定义函数
- **THEN** 必须使用正确的语法：`func name(params): ReturnType { }`
- **THEN** 必须显式声明返回类型（包括 Unit）
- **THEN** 必须使用 `@entry` 标记主函数
- **THEN** 主函数必须声明为 `func main(): Int32`
- **THEN** 单表达式函数应使用简写：`func name(params): Type => expression`
- **THEN** 函数重载必须参数类型或个数不同
- **THEN** 高阶函数参数类型格式：`(Type1, Type2) -> ReturnType`

#### Scenario: 变量声明
- **WHEN** 用户需要声明变量
- **THEN** 优先使用 `let`（不可变），仅在需要修改时使用 `var`
- **THEN** 类型声明必须正确：`let name: Type = value`
- **THEN** 可以使用类型推断，但必须确保类型安全
- **THEN** const 常量必须在编译时确定值
- **THEN** 延迟初始化变量必须在使用前赋值且只能赋值一次

#### Scenario: 项目结构
- **WHEN** 用户创建仓颉项目
- **THEN** 必须推荐标准结构：src/目录存放源码，test/目录存放测试
- **THEN** 必须提供 cjc.json 或 cjpm.toml 配置文件
- **THEN** 入口文件应命名为 main.cj 并放在 src/目录下
- **THEN** 模块文件应使用 .cj 扩展名

#### Scenario: 编译和运行
- **WHEN** 用户提供编译需求
- **THEN** 必须使用正确的 cjc 命令格式：`cjc source.cj -o output`
- **THEN** 多文件编译必须列出所有源文件
- **THEN** 推荐使用 cjpm 包管理器进行项目管理
- **THEN** 优化级别使用 `-O0` 到 `-O3`
- **THEN** 调试信息使用 `-g` 标志
- **THEN** 交叉编译使用 `--target` 参数

#### Scenario: 类型系统
- **WHEN** 使用类、结构体、接口
- **THEN** 必须正确使用继承语法：`class Child : Parent`
- **THEN** 接口实现必须使用逗号分隔：`class A : Interface1, Interface2`
- **THEN** 重写方法必须使用 `override` 关键字
- **THEN** 虚方法必须使用 `open` 关键字
- **THEN** 结构体使用 `struct` 关键字，不支持继承
- **THEN** 枚举使用 `enum` 关键字，支持关联值：`case Name(Type)`
- **THEN** 类型别名使用 `typealias` 关键字

#### Scenario: 错误处理
- **WHEN** 需要异常处理
- **THEN** 必须使用 try-catch-finally 结构
- **THEN** 异常类必须继承 Exception
- **THEN** 推荐使用 Result 类型处理可预期错误
- **THEN** 只对不可恢复的错误抛出异常

#### Scenario: 控制流
- **WHEN** 使用条件语句
- **THEN** if 表达式必须使用括号：`if (condition) { }`
- **THEN** match 表达式必须覆盖所有情况或使用 else
- **THEN** 多值匹配使用逗号分隔：`case 1, 2 => value`
- **THEN** 类型匹配使用 `is` 关键字：`case is Int64`

#### Scenario: 循环
- **WHEN** 使用循环结构
- **THEN** 半开区间使用 `..`：`0..5`（0 到 4）
- **THEN** 闭区间使用 `...`：`0...5`（0 到 5）
- **THEN** for-in 循环必须使用括号：`for (item in collection)`
- **THEN** break 和 continue 只能在循环中使用

#### Scenario: 模块和导入
- **WHEN** 使用模块系统
- **THEN** 导入使用 `import` 关键字
- **THEN** 导入特定成员：`import module.{Member1, Member2}`
- **THEN** 导入并重命名：`import module.{Name => Alias}`
- **THEN** 使用简写：`use module`
- **THEN** 命名空间使用 `namespace` 关键字
- **THEN** 重导出使用 `pub use`

#### Scenario: 可见性
- **WHEN** 声明可见性
- **THEN** public：任何地方可访问
- **THEN** private：仅当前文件可访问
- **THEN** protected：仅子类和当前包可访问
- **THEN** 默认（无修饰符）：包内可见

#### Scenario: 泛型
- **WHEN** 使用泛型
- **THEN** 泛型参数使用尖括号：`func name<T>(param: T): T`
- **THEN** 泛型约束使用冒号：`<T: InterfaceName>`
- **THEN** 泛型类/结构体：`class Box<T>`

#### Scenario: 操作符
- **WHEN** 使用操作符
- **THEN** 管道操作符：`value |> func1 |> func2`
- **THEN** 函数组合：`func1 ~> func2`
- **THEN** Lambda 箭头：`{ x => x * 2 }`
- **THEN** 操作符重载使用 `operator func` 关键字

#### Scenario: 并发编程
- **WHEN** 使用并发特性
- **THEN** 线程创建：`Thread { code }`
- **THEN** 异步函数使用 `async` 关键字
- **THEN** 等待异步结果使用 `await`
- **THEN** 原子操作使用 `AtomicInt64` 等类型

### Requirement: 文档参考
系统 SHALL 在回答仓颉相关问题时参考以下文档：

**主要参考文档（本地）**：
- **`d:\LLM\llma\docs\cangjie-complete-reference.md`** - 仓颉编程语言完整参考手册（**首要参考**）
  - 该文档包含了仓颉语言的所有语法规范、代码模板和最佳实践
  - 所有代码示例必须严格遵循该文档的语法要求

**官方文档（在线）**：
- 官网：https://cangjie-lang.cn/
- 官方文档：https://cangjie-lang.cn/docs
- 包管理中心：https://pkg.cangjie-lang.cn/

**优先级规则**：
1. 本地完整参考手册 (`cangjie-complete-reference.md`) 为**第一优先级**
2. 当本地文档没有覆盖的内容时，参考官方文档
3. 所有代码生成必须通过合规性检查清单验证

## MODIFIED Requirements
### Requirement: 代码生成验证
所有仓颉代码在生成前必须验证：
1. 函数签名是否符合语法（参数类型、返回类型）
2. 变量声明是否正确（let/var 使用、类型标注）
3. 控制流语法是否正确（if/match/for/while）
4. 可见性修饰符是否正确（public/private/protected）
5. 导入语句格式是否正确（import/use）
6. 类型系统语法是否正确（class/struct/interface/enum）
7. 泛型语法是否正确（类型参数、约束）
8. 操作符使用是否正确（|>、~>、=>）
9. 异常处理结构是否完整（try-catch-finally）
10. 编译命令格式是否正确（cjc/cjpm）

### Requirement: 文档注释规范
系统 SHALL 在生成公共 API 时添加文档注释：
- 使用 `///` 开头
- 支持 Markdown 格式
- 包含参数说明和返回值说明

### Requirement: 代码风格检查
系统 SHALL 遵循以下代码风格：
- 类/结构体/枚举/接口：大驼峰命名（UserService）
- 函数/变量：小驼峰命名（getUserInfo）
- 常量：全大写 + 下划线（MAX_COUNT）
- 包名：全小写（com.example.utils）
- 优先使用不可变变量（let）
- 单表达式函数使用简写形式
- 使用模式匹配代替复杂 if-else

## REMOVED Requirements
无

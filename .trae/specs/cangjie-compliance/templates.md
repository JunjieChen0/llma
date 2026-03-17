# 仓颉编程语言代码模板

## 基础模板

### 1. 主函数模板
```cangjie
@entry
func main(): Int32 {
    println("Hello, Cangjie!")
    return 0
}
```

### 2. 标准函数模板
```cangjie
/// 函数描述
///
/// # 参数
/// - `param1`: 参数 1 描述
/// - `param2`: 参数 2 描述
///
/// # 返回
/// 返回值描述
func functionName(param1: Type1, param2: Type2): ReturnType {
    // 实现
    return value
}

// 单表达式简写
func add(a: Int64, b: Int64): Int64 => a + b
```

### 3. 变量声明模板
```cangjie
// 不可变变量（推荐）
let name: Type = value
let count = 10  // 类型推断

// 可变变量（仅在需要修改时使用）
var counter: Int64 = 0

// 延迟初始化
let value: Int64
value = 42

// 编译时常量
const PI = 3.14159
const MAX_SIZE = 100
```

## 类型定义模板

### 4. 类（Class）模板
```cangjie
/// 类描述
class ClassName {
    // 属性
    var property: Type = _
    
    // 构造函数
    public init(property: Type) {
        this.property = property
    }
    
    // 实例方法
    func methodName(): ReturnType {
        // 实现
    }
    
    // 虚方法（可被子类重写）
    open func virtualMethod(): Unit {
        // 实现
    }
}

// 继承
class SubClass : SuperClass {
    var childProperty: Type = _
    
    public init(property: Type, childProperty: Type) {
        super.init(property)
        this.childProperty = childProperty
    }
    
    // 重写方法
    override func methodName(): ReturnType {
        // 实现
    }
    
    // 重写虚方法
    override func virtualMethod(): Unit {
        // 实现
    }
}
```

### 5. 结构体（Struct）模板
```cangjie
/// 结构体描述
struct StructName {
    let immutableField: Type
    var mutableField: Type
    
    // 构造函数
    init(immutableField: Type, mutableField: Type) {
        this.immutableField = immutableField
        this.mutableField = mutableField
    }
    
    // 实例方法
    func method(): ReturnType {
        // 实现
    }
    
    // Const 方法（编译时求值）
    const func constMethod(): Type {
        // 只能使用 let 和 const
    }
}
```

### 6. 接口（Interface）模板
```cangjie
/// 接口描述
interface InterfaceName {
    func method1(): ReturnType
    func method2(param: Type): ReturnType
}

// 实现多个接口
class Implementation : Interface1, Interface2 {
    override func method1(): ReturnType {
        // 实现
    }
    
    override func method2(param: Type): ReturnType {
        // 实现
    }
}
```

### 7. 枚举（Enum）模板
```cangjie
/// 枚举描述
enum EnumName {
    case Case1
    case Case2
    case CaseWithParam(field: Type)
}

// 使用模式匹配
func handleEnum(value: EnumName): String {
    match (value) {
        case EnumName.Case1 => "Case 1"
        case EnumName.Case2 => "Case 2"
        case EnumName.CaseWithParam(field) => "Case with param: ${field}"
    }
}
```

### 8. 类型别名模板
```cangjie
typealias IntArray = Array<Int64>
typealias StringMap = Map<String, Int64>
typealias Callback = (Int64) -> Unit
typealias Predicate<T> = (T) -> Bool
```

## 控制流模板

### 9. If-Else 模板
```cangjie
let value = 10

// 基础 if-else
if (value > 0) {
    println("Positive")
} else {
    println("Non-positive")
}

// if-else if-else
if (value >= 90) {
    println("优秀")
} else if (value >= 60) {
    println("及格")
} else {
    println("不及格")
}
```

### 10. Match 表达式模板
```cangjie
let day = 3

// 基础匹配
let dayName = match (day) {
    case 1 => "Monday"
    case 2 => "Tuesday"
    case 3 => "Wednesday"
    case 4, 5 => "Thursday or Friday"  // 多值匹配
    else => "Weekend"
}

// 类型匹配
let value: Any = 42
let typeInfo = match (value) {
    case is Int64 => "整数：${value}"
    case is String => "字符串：${value}"
    case is Bool => "布尔值：${value}"
    else => "未知类型"
}

// 解构匹配
enum Result<T> {
    case Success(T)
    case Failure(String)
}

let result: Result<Int64> = Result.Success(100)
let message = match (result) {
    case Result.Success(value) => "成功：${value}"
    case Result.Failure(msg) => "失败：${msg}"
}
```

### 11. 循环模板
```cangjie
// for-in 范围循环
for (i in 0..5) {  // 0 到 4（半开区间）
    println(i)
}

for (i in 0...5) {  // 0 到 5（闭区间）
    println(i)
}

// 遍历数组
let numbers = [1, 2, 3, 4, 5]
for (num in numbers) {
    println(num)
}

// 遍历 Map
let map = Map<String, Int64>()
map.put("a", 1)
map.put("b", 2)
for ((key, value) in map.entries()) {
    println("${key}: ${value}")
}

// while 循环
var i = 0
while (i < 5) {
    println(i)
    i += 1
}

// do-while 循环
var j = 0
do {
    println(j)
    j += 1
} while (j < 5)

// break 和 continue
for (i in 0..10) {
    if (i == 5) break      // 跳出循环
    if (i % 2 == 0) continue  // 跳过本次迭代
    println(i)
}
```

## Lambda 和高阶函数模板

### 12. Lambda 表达式模板
```cangjie
// 完整形式
let add: (Int64, Int64) -> Int64 = { a: Int64, b: Int64 => a + b }

// 类型推断
let multiply = { a: Int64, b: Int64 => a * b }

// 无参数 Lambda
let printHello = { => println("Hello") }

// 立即调用
let result = { a: Int64, b: Int64 => a + b }(5, 3)

// 尾随 Lambda（语法糖）
func myIf(condition: Bool, action: () -> Int64): Int64 {
    if (condition) { action() } else { 0 }
}
let value = myIf(true) { => 100 }
```

### 13. 高阶函数模板
```cangjie
// 函数作为参数
func applyTwice(f: (Int64) -> Int64, x: Int64): Int64 {
    f(f(x))
}
let result = applyTwice({ x => x * 2 }, 5)  // 20

// 闭包捕获上下文
func makeCounter(): () -> Int64 {
    var count = 0
    return { => 
        count += 1
        count
    }
}
let counter = makeCounter()
println(counter())  // 1
println(counter())  // 2
```

## 泛型模板

### 14. 泛型函数和类模板
```cangjie
// 泛型函数
func swap<T>(a: T, b: T): (T, T) {
    (b, a)
}

// 泛型类
class Box<T> {
    var content: T = _
    
    public init(value: T) {
        this.content = value
    }
    
    func get(): T {
        this.content
    }
}

// 泛型约束
interface Printable {
    func toString(): String
}

func printItems<T: Printable>(items: Array<T>) {
    for (item in items) {
        println(item.toString())
    }
}
```

## 异常处理模板

### 15. 异常处理模板
```cangjie
// 自定义异常
class MyException : Exception {
    var code: Int64 = 0
    
    public init(message: String, code: Int64) {
        super.init(message)
        this.code = code
    }
}

// 抛出异常
func divide(a: Int64, b: Int64): Int64 {
    if (b == 0) {
        throw MyException("除零错误", 1001)
    }
    a / b
}

// 捕获异常
try {
    let result = divide(10, 0)
    println(result)
} catch (e: MyException) {
    println("自定义异常：${e.message}, 代码：${e.code}")
} catch (e: Exception) {
    println("通用异常：${e.message}")
} finally {
    println("清理资源")
}

// 使用 Result 类型处理可预期错误
func parseNumber(input: String): Result<Int64, String> {
    try {
        let num = input.toInt64()
        Result.Success(num)
    } catch (e: Exception) {
        Result.Failure("解析失败：${e.message}")
    }
}
```

## 并发编程模板

### 16. 并发编程模板
```cangjie
// 线程
let thread = Thread {
    println("子线程运行")
}
thread.start()
thread.join()

// 异步函数
async func fetchData(): String {
    await sleep(1000)
    "data"
}

// 等待异步结果
let result = await fetchData()

// 原子操作
import std.sync.atomic.{AtomicInt64}
let counter = AtomicInt64(0)
counter.fetchAdd(1)
```

## 操作符模板

### 17. 流式操作符模板
```cangjie
func inc(x: Int64): Int64 => x + 1
func double(x: Int64): Int64 => x * 2

// 管道操作符（数据从左向右传递）
let result = 5 |> inc |> double  // 等价于 double(inc(5)) = 12

// 函数组合（生成新函数）
let incThenDouble = inc ~> double
let result2 = incThenDouble(5)  // 12
```

### 18. 操作符重载模板
```cangjie
class Point {
    var x: Int64 = 0
    var y: Int64 = 0
    
    public init(a: Int64, b: Int64) {
        x = a
        y = b
    }
    
    // 一元操作符
    public operator func -(): Point {
        Point(-x, -y)
    }
    
    // 二元操作符
    public operator func +(p: Point): Point {
        Point(x + p.x, y + p.y)
    }
    
    // 下标操作符
    public operator func [](i: Int64): Int64 {
        if (i == 0) { x } else { y }
    }
    
    // 调用操作符
    public operator func ()(): Unit {
        println("Point(${x}, ${y})")
    }
}
```

## 模块和导入模板

### 19. 导入语句模板
```cangjie
// 导入整个模块
import std.io

// 导入特定成员
import std.io.{File, BufferedReader}

// 导入并重命名
import std.io.{File => MyFile}

// 使用简写
use std.io

// 命名空间
namespace com.example.utils {
    public func formatDate(date: String): String {
        // 实现
    }
}

// 使用
import com.example.utils
let formatted = utils.formatDate("2024-01-01")

// 重导出
pub use std.io.{println, readLine}
```

## 项目配置模板

### 20. cjc.json 模板
```json
{
  "project": {
    "name": "my-project",
    "version": "1.0.0",
    "description": "My Cangjie Project"
  },
  "compiler": {
    "outputDir": "./build",
    "optimization": "release",
    "targetArch": "x86_64",
    "debugInfo": true
  },
  "dependencies": [
    {
      "name": "std",
      "version": "1.0.0"
    }
  ],
  "sources": [
    "src/**/*.cj"
  ]
}
```

### 21. cjpm.toml 模板
```toml
[package]
name = "my-project"
version = "1.0.0"
edition = "1.0"
authors = ["Your Name <email@example.com>"]
description = "My Cangjie Project"

[dependencies]
std = "1.0.0"
http-client = { version = "0.5.0", features = ["tls"] }
json-parser = "1.2.0"

[dev-dependencies]
test-framework = "0.3.0"

[build]
output-dir = "./build"
optimization = "release"
```

## 编译命令模板

### 22. 编译命令示例
```bash
# 单文件编译
cjc main.cj -o main

# 多文件编译
cjc main.cj utils.cj models/user.cj -o myapp

# 使用项目配置
cjc --config cjc.json

# 使用包管理器
cjpm build

# 优化级别
cjc -O2 main.cj -o main

# 调试信息
cjc -g main.cj -o main

# 交叉编译
cjc --target wasm main.cj -o main.wasm

# 运行
./main
cjpm run
```

## 标准库常用模板

### 23. 输入输出模板
```cangjie
import std.io

// 控制台
println("Hello, World!")
let input = readLine()

// 文件读写
let file = File.open("test.txt", FileMode.READ)
let content = file.readAll()
file.close()

// try-with-resources 自动关闭
try (let file = File.open("test.txt", FileMode.READ)) {
    println(file.readAll())
}
```

### 24. 集合类型模板
```cangjie
// 数组
let arr = [1, 2, 3]
arr.append(4)
arr.remove(0)
let first = arr[0]
let size = arr.size()

// List
let list = List<Int64>()
list.add(1)
list.add(2)

// Map
let map = Map<String, Int64>()
map.put("a", 1)
map.put("b", 2)
let value = map.get("a")
for ((k, v) in map.entries()) {
    println("${k}=${v}")
}

// Set
let set = Set<Int64>()
set.add(1)
set.add(2)
set.add(1)  // 重复元素自动去重
```

### 25. 字符串处理模板
```cangjie
let str = "Hello, 仓颉!"

// 常用方法
let length = str.length()
let upper = str.toUpperCase()
let lower = str.toLowerCase()
let sub = str.substring(0, 5)
let parts = str.split(",")

// 字符串插值
let name = "Alice"
let greeting = "Hello, ${name}!"
```

### 26. 时间日期模板
```cangjie
import std.time

let now = Instant.now()
println(now.toUnixMillis())

let duration = Duration.ofSeconds(5)
sleep(duration)
```

### 27. 数学函数模板
```cangjie
import std.math

let pi = PI
let absVal = abs(-5)
let maxVal = max(10, 20)
let sqrtVal = sqrt(16.0)
```

---

## 官方资源
- 官网：https://cangjie-lang.cn/
- 官方文档：https://cangjie-lang.cn/docs
- 包管理中心：https://pkg.cangjie-lang.cn/

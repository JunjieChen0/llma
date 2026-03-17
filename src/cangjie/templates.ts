// cangjie/templates.ts - 仓颉语言代码模板库
// 提供常用代码模板用于 few-shot 学习

export interface CangjieTemplate {
  id: string;
  name: string;
  description: string;
  category: 'function' | 'class' | 'control' | 'io' | 'data_structure' | 'algorithm';
  template: string;
  usage: string;
}

// 仓颉语言常用代码模板
export const CANGJIE_TEMPLATES: CangjieTemplate[] = [
  // ========== 函数定义 ==========
  {
    id: 'func_basic',
    name: '基础函数',
    description: '带参数和返回值的函数',
    category: 'function',
    template: `func functionName(param1: Type1, param2: Type2): ReturnType {
    // 函数实现
    return value;
}`,
    usage: '用于定义普通函数'
  },
  {
    id: 'func_void',
    name: '无返回值函数',
    description: '不返回值的函数',
    category: 'function',
    template: `func functionName(param: Type): Void {
    // 执行操作，无返回值
}`,
    usage: '用于执行操作但不返回结果'
  },
  {
    id: 'main_entry',
    name: '主函数入口',
    description: '程序入口点',
    category: 'function',
    template: `main() {
    // 程序主逻辑
}`,
    usage: '每个程序的入口点'
  },
  
  // ========== 控制流 ==========
  {
    id: 'for_range',
    name: '范围循环',
    description: '遍历数字范围',
    category: 'control',
    template: `for (i in 0..n) {
    // 循环体
}`,
    usage: '用于固定次数的循环'
  },
  {
    id: 'for_array',
    name: '数组遍历',
    description: '遍历数组元素',
    category: 'control',
    template: `for (item in array) {
    // 处理 item
}`,
    usage: '用于遍历数组或集合'
  },
  {
    id: 'if_else',
    name: '条件判断',
    description: 'if-else 条件语句',
    category: 'control',
    template: `if (condition) {
    // 条件为真
} else {
    // 条件为假
}`,
    usage: '用于条件分支'
  },
  {
    id: 'match_expr',
    name: '模式匹配',
    description: 'match 表达式',
    category: 'control',
    template: `match (value) {
    case pattern1 => {
        // 匹配 pattern1
    }
    case pattern2 => {
        // 匹配 pattern2
    }
    else => {
        // 默认情况
    }
}`,
    usage: '用于多分支模式匹配'
  },
  
  // ========== 数据结构 ==========
  {
    id: 'array_decl',
    name: '数组声明',
    description: '声明和初始化数组',
    category: 'data_structure',
    template: `let array: Array<Type> = [value1, value2, value3]`,
    usage: '声明并初始化数组'
  },
  {
    id: 'array_access',
    name: '数组访问',
    description: '访问数组元素',
    category: 'data_structure',
    template: `let element = array[index]
array[index] = newValue`,
    usage: '读取和修改数组元素'
  },
  {
    id: 'struct_def',
    name: '结构体定义',
    description: '定义结构体类型',
    category: 'data_structure',
    template: `struct StructName {
    var field1: Type1
    var field2: Type2
    
    func methodName(self: StructName): ReturnType {
        // 方法实现
    }
}`,
    usage: '定义自定义数据结构'
  },
  
  // ========== 输入输出 ==========
  {
    id: 'io_println',
    name: '打印输出',
    description: '带换行符的输出',
    category: 'io',
    template: `println("message: \${value}")`,
    usage: '输出信息到控制台'
  },
  {
    id: 'io_print',
    name: '打印输出（无换行）',
    description: '不带换行符的输出',
    category: 'io',
    template: `print("message: \${value}")`,
    usage: '输出信息但不换行'
  },
  {
    id: 'io_readline',
    name: '读取输入',
    description: '从控制台读取一行',
    category: 'io',
    template: `let input = readLine()`,
    usage: '读取用户输入'
  },
  
  // ========== 算法模板 ==========
  {
    id: 'algo_swap',
    name: '交换变量',
    description: '交换两个变量的值',
    category: 'algorithm',
    template: `let temp = a
a = b
b = temp`,
    usage: '交换两个变量的值'
  },
  {
    id: 'algo_bubble_sort',
    name: '冒泡排序',
    description: '冒泡排序算法',
    category: 'algorithm',
    template: `func bubbleSort(arr: Array<Int64>): Array<Int64> {
    let n = arr.size
    var result = arr
    for (i in 0..(n-1)) {
        for (j in 0..(n-i-1)) {
            if (result[j] > result[j + 1]) {
                let temp = result[j]
                result[j] = result[j + 1]
                result[j + 1] = temp
            }
        }
    }
    return result
}`,
    usage: '对数组进行升序排序'
  },
  {
    id: 'algo_linear_search',
    name: '线性搜索',
    description: '在数组中查找元素',
    category: 'algorithm',
    template: `func linearSearch(arr: Array<Int64>, target: Int64): Int64 {
    for (i in 0..arr.size) {
        if (arr[i] == target) {
            return i
        }
    }
    return -1
}`,
    usage: '在数组中查找目标元素'
  },
  {
    id: 'algo_max_min',
    name: '最大值最小值',
    description: '查找数组中的最大/最小值',
    category: 'algorithm',
    template: `func findMax(arr: Array<Int64>): Int64 {
    var max = arr[0]
    for (i in 1..arr.size) {
        if (arr[i] > max) {
            max = arr[i]
        }
    }
    return max
}`,
    usage: '查找数组中的最大值'
  }
];

// 根据类别筛选模板
export function getTemplatesByCategory(category: CangjieTemplate['category']): CangjieTemplate[] {
  return CANGJIE_TEMPLATES.filter(t => t.category === category);
}

// 根据 ID 获取模板
export function getTemplateById(id: string): CangjieTemplate | undefined {
  return CANGJIE_TEMPLATES.find(t => t.id === id);
}

// 根据用户意图推荐模板
export function recommendTemplates(intent: string): CangjieTemplate[] {
  const lowerIntent = intent.toLowerCase();
  const recommendations: CangjieTemplate[] = [];
  
  // 根据关键词推荐
  if (lowerIntent.includes('排序') || lowerIntent.includes('sort')) {
    recommendations.push(getTemplateById('algo_bubble_sort')!);
  }
  if (lowerIntent.includes('查找') || lowerIntent.includes('search')) {
    recommendations.push(getTemplateById('algo_linear_search')!);
  }
  if (lowerIntent.includes('循环') || lowerIntent.includes('loop') || lowerIntent.includes('for')) {
    recommendations.push(getTemplateById('for_range')!);
    recommendations.push(getTemplateById('for_array')!);
  }
  if (lowerIntent.includes('判断') || lowerIntent.includes('if') || lowerIntent.includes('condition')) {
    recommendations.push(getTemplateById('if_else')!);
  }
  if (lowerIntent.includes('数组') || lowerIntent.includes('array')) {
    recommendations.push(getTemplateById('array_decl')!);
    recommendations.push(getTemplateById('array_access')!);
  }
  if (lowerIntent.includes('输入') || lowerIntent.includes('输出') || lowerIntent.includes('print')) {
    recommendations.push(getTemplateById('io_println')!);
    recommendations.push(getTemplateById('io_readline')!);
  }
  
  return recommendations;
}

// 生成 few-shot 提示
export function generateFewShotPrompt(intent: string, maxTemplates = 3): string {
  const recommended = recommendTemplates(intent);
  const selected = recommended.slice(0, maxTemplates);
  
  if (selected.length === 0) {
    return '';
  }
  
  let prompt = '\n\n**参考代码模板：**\n';
  for (const template of selected) {
    prompt += `\n// ${template.name}: ${template.description}\n`;
    prompt += `${template.template}\n`;
  }
  
  return prompt;
}

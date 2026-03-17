#!/usr/bin/env python3
"""
批量SVG转Base64 CSS转换器
支持多个输入文件，可合并输出或单独输出。
"""

import argparse
import base64
import sys
from pathlib import Path

def svg_to_css_rule(svg_path, class_name, css_property):
    """将单个SVG转换为CSS规则"""
    try:
        with open(svg_path, "rb") as f:
            svg_bytes = f.read()
    except Exception as e:
        print(f"警告：无法读取 {svg_path} - {e}", file=sys.stderr)
        return None

    base64_str = base64.b64encode(svg_bytes).decode('ascii')
    data_url = f"data:image/svg+xml;base64,{base64_str}"

    # 用文件名作为默认类名（去除扩展名，加上点）
    if class_name is None:
        # 默认类名：.文件名（不含扩展名）
        cls = "." + Path(svg_path).stem
    else:
        cls = class_name

    return f"{cls} {{\n  {css_property}: url('{data_url}');\n}}"

def main():
    parser = argparse.ArgumentParser(description="批量将SVG转换为Base64并生成CSS规则")
    parser.add_argument("inputs", nargs="+", help="输入的SVG文件路径（支持多个）")
    parser.add_argument("-o", "--output", help="输出文件路径（若指定，所有规则写入此文件；否则每个输入生成单独输出文件）")
    parser.add_argument("-c", "--class", dest="class_name", default=None,
                        help="CSS类名（若指定，所有规则使用相同类名，否则以文件名作为类名）")
    parser.add_argument("-p", "--property", default="background-image",
                        help="CSS属性名（默认：background-image）")
    args = parser.parse_args()

    if args.output:
        # 合并输出到一个文件
        with open(args.output, "w", encoding="utf-8") as out_f:
            for svg_path in args.inputs:
                rule = svg_to_css_rule(svg_path, args.class_name, args.property)
                if rule:
                    out_f.write(rule + "\n\n")
        print(f"所有CSS规则已合并写入 {args.output}")
    else:
        # 每个输入单独输出：输出文件名 = 输入文件名（扩展名改为.css）
        for svg_path in args.inputs:
            output_path = Path(svg_path).with_suffix(".css")
            rule = svg_to_css_rule(svg_path, args.class_name, args.property)
            if rule:
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(rule)
                print(f"已生成 {output_path}")

if __name__ == "__main__":
    main()
"""
Animal Farm - Python 多文件测试项目
主入口文件
"""

from animal import Animal
from dog import Dog
from cat import Cat
from duck import Duck
from typing import List


def main():
    """主程序入口"""
    print("=== Animal Farm Demo ===")
    
    # 创建动物
    animals: List[Animal] = []
    
    generic = Animal("Generic", 5)
    dog = Dog("Buddy", 3, "Golden Retriever")
    cat = Cat("Whiskers", 2, "Orange")
    duck = Duck("Donald", 4, "White")
    
    animals.extend([generic, dog, cat, duck])
    
    # 多态调用
    for animal in animals:
        animal.make_sound()
    
    # 特有方法
    dog.fetch()
    cat.climb()
    duck.fly()
    duck.swim()
    
    # 类型检查
    print(f"\nDog is Animal: {isinstance(dog, Animal)}")
    print(f"Duck can fly: {hasattr(duck, 'fly')}")
    print(f"Duck can swim: {hasattr(duck, 'swim')}")


if __name__ == "__main__":
    main()

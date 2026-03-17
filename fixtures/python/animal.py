"""
动物基类
"""
from typing import Any


class Animal:
    """动物基类"""
    
    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age
    
    def make_sound(self) -> None:
        """发出声音"""
        print("Some generic animal sound")
    
    def eat(self, food: str) -> None:
        """吃东西"""
        print(f"{self.name} is eating {food}")
    
    def __str__(self) -> str:
        return f"Animal(name={self.name}, age={self.age})"
    
    def __repr__(self) -> str:
        return self.__str__()

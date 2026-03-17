"""
猫类 - 继承自动物
"""
from animal import Animal


class Cat(Animal):
    """猫类"""
    
    def __init__(self, name: str, age: int, color: str):
        super().__init__(name, age)
        self.color = color
    
    def make_sound(self) -> None:
        """猫叫"""
        print(f"{self.name} says: Meow! Meow!")
    
    def climb(self) -> None:
        """爬树"""
        print(f"{self.name} is climbing a tree")
    
    def get_color(self) -> str:
        return self.color
    
    def __str__(self) -> str:
        return f"Cat(name={self.name}, age={self.age}, color={self.color})"

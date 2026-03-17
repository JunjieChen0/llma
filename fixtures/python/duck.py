"""
鸭子类 - 多重继承 (Flyable + Swimmable)
"""
from animal import Animal
from flyable import Flyable
from swimmable import Swimmable


class Duck(Animal, Flyable, Swimmable):
    """鸭子类 - 实现多个接口"""
    
    def __init__(self, name: str, age: int, feather_color: str):
        Animal.__init__(self, name, age)
        self.feather_color = feather_color
    
    def fly(self) -> None:
        """飞行"""
        print(f"{self.name} is flying with {self.feather_color} feathers")
    
    def land(self) -> None:
        """降落"""
        print(f"{self.name} is landing")
    
    def swim(self) -> None:
        """游泳"""
        print(f"{self.name} is swimming")
    
    def make_sound(self) -> None:
        """鸭叫"""
        print(f"{self.name} says: Quack! Quack!")
    
    def get_feather_color(self) -> str:
        return self.feather_color
    
    def __str__(self) -> str:
        return f"Duck(name={self.name}, age={self.age}, feather_color={self.feather_color})"

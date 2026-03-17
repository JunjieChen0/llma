"""
狗类 - 继承自动物
"""
from animal import Animal


class Dog(Animal):
    """狗类"""
    
    def __init__(self, name: str, age: int, breed: str):
        super().__init__(name, age)
        self.breed = breed
    
    def make_sound(self) -> None:
        """狗叫"""
        print(f"{self.name} says: Woof! Woof!")
    
    def fetch(self) -> None:
        """捡球"""
        print(f"{self.name} is fetching the ball")
    
    def get_breed(self) -> str:
        return self.breed
    
    def __str__(self) -> str:
        return f"Dog(name={self.name}, age={self.age}, breed={self.breed})"

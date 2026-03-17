"""
可游泳的接口
"""
from abc import ABC, abstractmethod


class Swimmable(ABC):
    """可游泳动物接口"""
    
    @abstractmethod
    def swim(self) -> None:
        """游泳"""
        pass

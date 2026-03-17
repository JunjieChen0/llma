"""
可飞行的接口
"""
from abc import ABC, abstractmethod


class Flyable(ABC):
    """可飞行动物接口"""
    
    @abstractmethod
    def fly(self) -> None:
        """飞行"""
        pass
    
    @abstractmethod
    def land(self) -> None:
        """降落"""
        pass

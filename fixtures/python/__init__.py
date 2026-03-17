"""
Python 包初始化文件
"""

from .animal import Animal
from .dog import Dog
from .cat import Cat
from .duck import Duck
from .flyable import Flyable
from .swimmable import Swimmable

__all__ = [
    'Animal',
    'Dog',
    'Cat',
    'Duck',
    'Flyable',
    'Swimmable'
]

__version__ = '1.0.0'

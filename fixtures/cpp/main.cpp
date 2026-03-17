#include <iostream>
#include "Animal.h"
#include "Dog.h"
#include "Cat.h"

/**
 * 主程序入口
 */
int main() {
    std::cout << "=== Animal Farm Demo ===" << std::endl;
    
    // 创建动物
    Animal* generic = new Animal("Generic", 5);
    Dog* dog = new Dog("Buddy", 3, "Golden Retriever");
    Cat* cat = new Cat("Whiskers", 2, "Orange");
    
    // 多态调用
    generic->makeSound();
    dog->makeSound();
    cat->makeSound();
    
    // 特有方法
    dog->fetch();
    cat->climb();
    
    // 清理
    delete generic;
    delete dog;
    delete cat;
    
    return 0;
}

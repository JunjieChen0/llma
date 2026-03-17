#ifndef ANIMAL_H
#define ANIMAL_H

#include <string>

/**
 * 动物基类
 */
class Animal {
protected:
    std::string name;
    int age;

public:
    Animal(const std::string& name, int age);
    virtual ~Animal();
    
    virtual void makeSound() const;
    virtual void eat(const std::string& food);
    
    std::string getName() const;
    int getAge() const;
};

#endif // ANIMAL_H

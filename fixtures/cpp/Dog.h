#ifndef DOG_H
#define DOG_H

#include "Animal.h"
#include <string>

/**
 * 狗类，继承自动物
 */
class Dog : public Animal {
private:
    std::string breed;

public:
    Dog(const std::string& name, int age, const std::string& breed);
    ~Dog();
    
    void makeSound() const override;
    void fetch() const;
    
    std::string getBreed() const;
};

#endif // DOG_H

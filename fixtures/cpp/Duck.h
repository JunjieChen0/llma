#ifndef DUCK_H
#define DUCK_H

#include "Animal.h"
#include "Flyable.h"
#include "Swimmable.h"
#include <string>

/**
 * 鸭子类 - 多重继承
 */
class Duck : public Animal, public Flyable, public Swimmable {
private:
    std::string featherColor;

public:
    Duck(const std::string& name, int age, const std::string& featherColor);
    ~Duck();
    
    void fly() override;
    void land() override;
    void swim() override;
    
    void makeSound() const override;
    
    std::string getFeatherColor() const;
};

#endif // DUCK_H

#ifndef CAT_H
#define CAT_H

#include "Animal.h"
#include <string>

/**
 * 猫类，继承自动物
 */
class Cat : public Animal {
private:
    std::string color;

public:
    Cat(const std::string& name, int age, const std::string& color);
    ~Cat();
    
    void makeSound() const override;
    void climb() const;
    
    std::string getColor() const;
};

#endif // CAT_H

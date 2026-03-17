#include "Cat.h"
#include <iostream>

Cat::Cat(const std::string& name, int age, const std::string& color)
    : Animal(name, age), color(color) {}

Cat::~Cat() {}

void Cat::makeSound() const {
    std::cout << name << " says: Meow! Meow!" << std::endl;
}

void Cat::climb() const {
    std::cout << name << " is climbing a tree" << std::endl;
}

std::string Cat::getColor() const {
    return color;
}

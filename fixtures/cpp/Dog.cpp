#include "Dog.h"
#include <iostream>

Dog::Dog(const std::string& name, int age, const std::string& breed)
    : Animal(name, age), breed(breed) {}

Dog::~Dog() {}

void Dog::makeSound() const {
    std::cout << name << " says: Woof! Woof!" << std::endl;
}

void Dog::fetch() const {
    std::cout << name << " is fetching the ball" << std::endl;
}

std::string Dog::getBreed() const {
    return breed;
}

#include "Duck.h"
#include <iostream>

Duck::Duck(const std::string& name, int age, const std::string& featherColor)
    : Animal(name, age), featherColor(featherColor) {}

Duck::~Duck() {}

void Duck::fly() {
    std::cout << name << " is flying with " << featherColor << " feathers" << std::endl;
}

void Duck::land() {
    std::cout << name << " is landing" << std::endl;
}

void Duck::swim() {
    std::cout << name << " is swimming" << std::endl;
}

void Duck::makeSound() const {
    std::cout << name << " says: Quack! Quack!" << std::endl;
}

std::string Duck::getFeatherColor() const {
    return featherColor;
}

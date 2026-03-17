#include "Animal.h"
#include <iostream>

Animal::Animal(const std::string& name, int age) 
    : name(name), age(age) {}

Animal::~Animal() {}

void Animal::makeSound() const {
    std::cout << "Some generic animal sound" << std::endl;
}

void Animal::eat(const std::string& food) {
    std::cout << name << " is eating " << food << std::endl;
}

std::string Animal::getName() const {
    return name;
}

int Animal::getAge() const {
    return age;
}

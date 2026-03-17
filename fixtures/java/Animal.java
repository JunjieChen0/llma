package com.example.model;

/**
 * 动物基类
 */
public class Animal {
    protected String name;
    protected int age;
    
    public Animal(String name, int age) {
        this.name = name;
        this.age = age;
    }
    
    public void makeSound() {
        System.out.println("Some generic animal sound");
    }
    
    public void eat(String food) {
        System.out.println(name + " is eating " + food);
    }
    
    public String getName() {
        return name;
    }
    
    public int getAge() {
        return age;
    }
}

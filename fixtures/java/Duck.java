package com.example.model;

import com.example.interfaces.Flyable;
import com.example.interfaces.Swimmable;

/**
 * 鸭子类 - 同时实现多个接口
 */
public class Duck extends Animal implements Flyable, Swimmable {
    private String featherColor;
    
    public Duck(String name, int age, String featherColor) {
        super(name, age);
        this.featherColor = featherColor;
    }
    
    @Override
    public void fly() {
        System.out.println(name + " is flying with " + featherColor + " feathers");
    }
    
    @Override
    public void land() {
        System.out.println(name + " is landing");
    }
    
    @Override
    public void swim() {
        System.out.println(name + " is swimming");
    }
    
    @Override
    public void makeSound() {
        System.out.println(name + " says: Quack! Quack!");
    }
    
    public String getFeatherColor() {
        return featherColor;
    }
}

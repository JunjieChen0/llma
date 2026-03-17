package com.example.kotlin

/**
 * 动物基类
 */
open class Animal(
    protected val name: String,
    protected val age: Int
) {
    open fun makeSound() {
        println("Some generic animal sound")
    }
    
    open fun eat(food: String) {
        println("$name is eating $food")
    }
}

package com.example.kotlin

/**
 * 狗类 - Kotlin 继承
 */
class Dog(name: String, age: Int, private val breed: String) : Animal(name, age) {
    
    override fun makeSound() {
        println("$name says: Woof! Woof!")
    }
    
    fun fetch() {
        println("$name is fetching the ball")
    }
    
    fun getBreed(): String {
        return breed
    }
}

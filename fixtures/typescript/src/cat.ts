/**
 * 猫类 - 继承自动物
 */
import { Animal } from './animal';

export class Cat extends Animal {
    private color: string;
    
    constructor(name: string, age: number, color: string) {
        super(name, age);
        this.color = color;
    }
    
    makeSound(): void {
        console.log(`${this.name} says: Meow! Meow!`);
    }
    
    climb(): void {
        console.log(`${this.name} is climbing a tree`);
    }
    
    getColor(): string {
        return this.color;
    }
    
    toString(): string {
        return `Cat(name=${this.name}, age=${this.age}, color=${this.color})`;
    }
}

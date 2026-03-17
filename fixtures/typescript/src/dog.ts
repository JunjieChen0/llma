/**
 * 狗类 - 继承自动物
 */
import { Animal } from './animal';

export class Dog extends Animal {
    private breed: string;
    
    constructor(name: string, age: number, breed: string) {
        super(name, age);
        this.breed = breed;
    }
    
    makeSound(): void {
        console.log(`${this.name} says: Woof! Woof!`);
    }
    
    fetch(): void {
        console.log(`${this.name} is fetching the ball`);
    }
    
    getBreed(): string {
        return this.breed;
    }
    
    toString(): string {
        return `Dog(name=${this.name}, age=${this.age}, breed=${this.breed})`;
    }
}

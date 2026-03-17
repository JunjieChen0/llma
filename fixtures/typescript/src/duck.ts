/**
 * 鸭子类 - 实现多个接口
 */
import { Animal } from './animal';
import { Flyable, Swimmable } from './interfaces';

export class Duck extends Animal implements Flyable, Swimmable {
    private featherColor: string;
    
    constructor(name: string, age: number, featherColor: string) {
        super(name, age);
        this.featherColor = featherColor;
    }
    
    fly(): void {
        console.log(`${this.name} is flying with ${this.featherColor} feathers`);
    }
    
    land(): void {
        console.log(`${this.name} is landing`);
    }
    
    swim(): void {
        console.log(`${this.name} is swimming`);
    }
    
    makeSound(): void {
        console.log(`${this.name} says: Quack! Quack!`);
    }
    
    getFeatherColor(): string {
        return this.featherColor;
    }
    
    toString(): string {
        return `Duck(name=${this.name}, age=${this.age}, featherColor=${this.featherColor})`;
    }
}

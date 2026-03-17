/**
 * 动物基类
 */
export class Animal {
    protected name: string;
    protected age: number;
    
    constructor(name: string, age: number) {
        this.name = name;
        this.age = age;
    }
    
    makeSound(): void {
        console.log('Some generic animal sound');
    }
    
    eat(food: string): void {
        console.log(`${this.name} is eating ${food}`);
    }
    
    getName(): string {
        return this.name;
    }
    
    getAge(): number {
        return this.age;
    }
    
    toString(): string {
        return `Animal(name=${this.name}, age=${this.age})`;
    }
}

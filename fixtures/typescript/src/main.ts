/**
 * Animal Farm - TypeScript 多文件测试项目
 * 主入口文件
 */

import { Animal } from './animal';
import { Dog } from './dog';
import { Cat } from './cat';
import { Duck } from './duck';

function main(): void {
    console.log('=== Animal Farm Demo ===');
    
    // 创建动物
    const animals: Animal[] = [
        new Animal('Generic', 5),
        new Dog('Buddy', 3, 'Golden Retriever'),
        new Cat('Whiskers', 2, 'Orange'),
        new Duck('Donald', 4, 'White'),
    ];
    
    // 多态调用
    for (const animal of animals) {
        animal.makeSound();
    }
    
    // 特有方法
    const dog = animals[1] as Dog;
    dog.fetch();
    
    const cat = animals[2] as Cat;
    cat.climb();
    
    const duck = animals[3] as Duck;
    duck.fly();
    duck.swim();
    
    // 类型检查
    console.log(`\nDog is Animal: ${dog instanceof Animal}`);
    console.log(`Duck can fly: ${'fly' in duck}`);
    console.log(`Duck can swim: ${'swim' in duck}`);
}

main();

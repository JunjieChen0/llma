mod animal;
mod dog;
mod cat;
mod duck;

use animal::Animal;
use dog::Dog;
use cat::Cat;
use duck::Duck;

fn main() {
    println!("=== Animal Farm Demo ===");
    
    // 创建动物
    let animals: Vec<Box<dyn Animal>> = vec![
        Box::new(animal::BaseAnimal::new("Generic", 5)),
        Box::new(Dog::new("Buddy", 3, "Golden Retriever")),
        Box::new(Cat::new("Whiskers", 2, "Orange")),
        Box::new(Duck::new("Donald", 4, "White")),
    ];
    
    // 多态调用
    for animal in &animals {
        animal.make_sound();
    }
    
    // 特有方法
    let dog = Dog::new("Buddy", 3, "Golden Retriever");
    dog.fetch();
    
    let cat = Cat::new("Whiskers", 2, "Orange");
    cat.climb();
    
    let duck = Duck::new("Donald", 4, "White");
    duck.fly();
    duck.swim();
}

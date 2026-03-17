use crate::animal::{Animal, BaseAnimal};

pub struct Dog {
    pub base: BaseAnimal,
    pub breed: String,
}

impl Dog {
    pub fn new(name: &str, age: i32, breed: &str) -> Self {
        Dog {
            base: BaseAnimal::new(name, age),
            breed: breed.to_string(),
        }
    }
    
    pub fn fetch(&self) {
        println!("{} is fetching the ball", self.base.name);
    }
    
    pub fn get_breed(&self) -> &str {
        &self.breed
    }
}

impl Animal for Dog {
    fn make_sound(&self) {
        println!("{} says: Woof! Woof!", self.base.name);
    }
    
    fn eat(&self, food: &str) {
        println!("{} is eating {}", self.base.name, food);
    }
    
    fn get_name(&self) -> &str {
        self.base.get_name()
    }
    
    fn get_age(&self) -> i32 {
        self.base.get_age()
    }
}

use crate::animal::{Animal, BaseAnimal};

pub struct Cat {
    pub base: BaseAnimal,
    pub color: String,
}

impl Cat {
    pub fn new(name: &str, age: i32, color: &str) -> Self {
        Cat {
            base: BaseAnimal::new(name, age),
            color: color.to_string(),
        }
    }
    
    pub fn climb(&self) {
        println!("{} is climbing a tree", self.base.name);
    }
    
    pub fn get_color(&self) -> &str {
        &self.color
    }
}

impl Animal for Cat {
    fn make_sound(&self) {
        println!("{} says: Meow! Meow!", self.base.name);
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

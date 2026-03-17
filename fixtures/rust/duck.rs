use crate::animal::{Animal, BaseAnimal};

pub trait Flyable {
    fn fly(&self);
    fn land(&self);
}

pub trait Swimmable {
    fn swim(&self);
}

pub struct Duck {
    pub base: BaseAnimal,
    pub feather_color: String,
}

impl Duck {
    pub fn new(name: &str, age: i32, feather_color: &str) -> Self {
        Duck {
            base: BaseAnimal::new(name, age),
            feather_color: feather_color.to_string(),
        }
    }
    
    pub fn get_feather_color(&self) -> &str {
        &self.feather_color
    }
}

impl Animal for Duck {
    fn make_sound(&self) {
        println!("{} says: Quack! Quack!", self.base.name);
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

impl Flyable for Duck {
    fn fly(&self) {
        println!("{} is flying with {} feathers", self.base.name, self.feather_color);
    }
    
    fn land(&self) {
        println!("{} is landing", self.base.name);
    }
}

impl Swimmable for Duck {
    fn swim(&self) {
        println!("{} is swimming", self.base.name);
    }
}

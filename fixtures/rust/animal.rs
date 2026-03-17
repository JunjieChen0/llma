pub trait Animal {
    fn make_sound(&self);
    fn eat(&self, food: &str);
    fn get_name(&self) -> &str;
    fn get_age(&self) -> i32;
}

pub struct BaseAnimal {
    pub name: String,
    pub age: i32,
}

impl BaseAnimal {
    pub fn new(name: &str, age: i32) -> Self {
        BaseAnimal {
            name: name.to_string(),
            age,
        }
    }
}

impl Animal for BaseAnimal {
    fn make_sound(&self) {
        println!("Some generic animal sound");
    }
    
    fn eat(&self, food: &str) {
        println!("{} is eating {}", self.name, food);
    }
    
    fn get_name(&self) -> &str {
        &self.name
    }
    
    fn get_age(&self) -> i32 {
        self.age
    }
}

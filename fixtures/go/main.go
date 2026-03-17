package main

import (
	"fmt"
	"animalfarm/animal"
	"animalfarm/dog"
	"animalfarm/cat"
)

func main() {
	fmt.Println("=== Animal Farm Demo ===")
	
	// 创建动物
	animals := []animal.Animal{
		&animal.BaseAnimal{Name: "Generic", Age: 5},
		&dog.Dog{Name: "Buddy", Age: 3, Breed: "Golden Retriever"},
		&cat.Cat{Name: "Whiskers", Age: 2, Color: "Orange"},
	}
	
	// 多态调用
	for _, a := range animals {
		a.MakeSound()
	}
	
	// 类型断言
	if d, ok := animals[1].(*dog.Dog); ok {
		d.Fetch()
	}
	
	if c, ok := animals[2].(*cat.Cat); ok {
		c.Climb()
	}
}

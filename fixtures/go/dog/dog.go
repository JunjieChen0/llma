package dog

import (
	"animalfarm/animal"
	"fmt"
)

// Dog 狗类
type Dog struct {
	animal.BaseAnimal
	Breed string
}

// MakeSound 狗叫 (重写)
func (d *Dog) MakeSound() {
	fmt.Printf("%s says: Woof! Woof!\n", d.Name)
}

// Fetch 捡球
func (d *Dog) Fetch() {
	fmt.Printf("%s is fetching the ball\n", d.Name)
}

// GetBreed 获取品种
func (d *Dog) GetBreed() string {
	return d.Breed
}

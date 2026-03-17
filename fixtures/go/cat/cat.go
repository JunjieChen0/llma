package cat

import (
	"animalfarm/animal"
	"fmt"
)

// Cat 猫类
type Cat struct {
	animal.BaseAnimal
	Color string
}

// MakeSound 猫叫 (重写)
func (c *Cat) MakeSound() {
	fmt.Printf("%s says: Meow! Meow!\n", c.Name)
}

// Climb 爬树
func (c *Cat) Climb() {
	fmt.Printf("%s is climbing a tree\n", c.Name)
}

// GetColor 获取颜色
func (c *Cat) GetColor() string {
	return c.Color
}

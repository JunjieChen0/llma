package animal

import "fmt"

// Animal 动物接口
type Animal interface {
	MakeSound()
	Eat(food string)
	GetName() string
	GetAge() int
}

// BaseAnimal 动物基类
type BaseAnimal struct {
	Name string
	Age  int
}

// MakeSound 发出声音
func (a *BaseAnimal) MakeSound() {
	fmt.Println("Some generic animal sound")
}

// Eat 吃东西
func (a *BaseAnimal) Eat(food string) {
	fmt.Printf("%s is eating %s\n", a.Name, food)
}

// GetName 获取名字
func (a *BaseAnimal) GetName() string {
	return a.Name
}

// GetAge 获取年龄
func (a *BaseAnimal) GetAge() int {
	return a.Age
}

using System;

namespace Example.Models
{
    /// <summary>
    /// 动物基类
    /// </summary>
    public class Animal
    {
        protected string name;
        protected int age;
        
        public Animal(string name, int age)
        {
            this.name = name;
            this.age = age;
        }
        
        public virtual void MakeSound()
        {
            Console.WriteLine("Some generic animal sound");
        }
        
        public virtual void Eat(string food)
        {
            Console.WriteLine($"{name} is eating {food}");
        }
        
        public string GetName() => name;
        public int GetAge() => age;
    }
}
